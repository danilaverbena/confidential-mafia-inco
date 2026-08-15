// Runs the Gemini-driven players and keeps a live game moving.
//
// Two jobs:
//  1. Play. Each AI agent joins, decrypts its own role, and each round decides
//     a night target and a day vote by reasoning over public table state (see
//     aiPlayer.ts -- an agent can only ever decrypt its own role).
//  2. Drive. The mechanical, non-secret steps of the protocol -- resolving the
//     night, fetching the covalidator attestation, settling it, resolving the
//     day vote -- are things any participant may call. A human playing solo
//     shouldn't have to hand-crank them, so this process performs whichever of
//     them the contract is currently waiting on. It never performs a *choice*
//     on a human's behalf: it will not submit their night action or their
//     vote, and it stops and waits for those.
//
// Usage (from backend/):  npx tsx scripts/run-ai-players.ts [--once]

import "dotenv/config";
import { createPublicClient, http, type Abi, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import artifact from "../abi/ConfidentialMafia.json" with { type: "json" };
import { AiPlayer, attestedReveal, roleFromValue, type Role, type TableView } from "../src/aiPlayer.js";

const RPC = process.env.BASE_SEPOLIA_RPC_URL!;
const CONTRACT = process.env.CONFIDENTIAL_MAFIA_ADDRESS as Address;
const GEMINI_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const BOT_KEYS = (process.env.AI_PLAYER_KEYS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean) as `0x${string}`[];

const abi = (artifact as { abi: Abi }).abi;
const ONCE = process.argv.includes("--once");

const STATE = [
  "Joining",
  "Assigned",
  "Night",
  "NightPendingReveal",
  "NightRoleReveal",
  "Day",
  "DayRoleReveal",
  "GameOver",
] as const;

const short = (a: string) => `${a.slice(0, 6)}..${a.slice(-4)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

if (!RPC || !CONTRACT || !GEMINI_KEY || !BOT_KEYS.length) {
  console.error(
    "Missing env. Need BASE_SEPOLIA_RPC_URL, CONFIDENTIAL_MAFIA_ADDRESS, GEMINI_API_KEY, AI_PLAYER_KEYS."
  );
  process.exit(1);
}

const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
const read = <T,>(fn: string, args: unknown[] = []) =>
  publicClient.readContract({ address: CONTRACT, abi, functionName: fn, args }) as Promise<T>;

const bots = BOT_KEYS.map(
  (k, i) =>
    new AiPlayer({
      name: `AI-${i + 1}`,
      privateKey: k,
      rpcUrl: RPC,
      contractAddress: CONTRACT,
      abi,
      geminiKey: GEMINI_KEY,
      geminiModel: GEMINI_MODEL,
    })
);

/** Assembles the same public picture a human player sees, plus this bot's own
 * decrypted role. */
async function buildView(bot: AiPlayer, mafiaCount: number): Promise<TableView> {
  const [round, count] = await Promise.all([read<bigint>("round"), read<bigint>("playerCount")]);
  const players: Address[] = [];
  for (let i = 0n; i < count; i++) players.push(await read<Address>("players", [i]));

  const rows = await Promise.all(
    players.map(async (a) => ({
      address: a,
      alive: await read<boolean>("alive", [a]),
      isMe: a.toLowerCase() === bot.address.toLowerCase(),
    }))
  );

  const deaths: TableView["deaths"] = [];
  for (const r of rows) {
    if (r.alive) continue;
    const v = await read<bigint>("revealedRoleValue", [r.address]);
    if (v > 0n) {
      deaths.push({ address: r.address, revealedRole: roleFromValue(v, mafiaCount), round: Number(round) });
    }
  }

  return {
    round: Number(round),
    me: bot.address,
    myRole: await bot.revealOwnRole(mafiaCount),
    players: rows,
    deaths,
  };
}

async function allPlayerAddresses(): Promise<Address[]> {
  const count = await read<bigint>("playerCount");
  const out: Address[] = [];
  for (let i = 0n; i < count; i++) out.push(await read<Address>("players", [i]));
  return out;
}

/** One pass over the current contract state. Returns a short status line. */
async function tick(): Promise<string> {
  const stateIdx = await read<number>("state");
  const state = STATE[stateIdx];
  const mafiaCount = Number(await read<number>("mafiaCount"));

  switch (state) {
    case "Joining": {
      for (const b of bots) await b.join();
      const count = Number(await read<bigint>("playerCount"));
      if (count < mafiaCount + 2) {
        return `Joining: ${count}/${mafiaCount + 2} seated -- waiting for more humans to join`;
      }
      const fee = await read<bigint>("deckFee", [count]);
      const bal = await publicClient.getBalance({ address: CONTRACT });
      if (bal < fee) return `Joining: contract underfunded (${bal} < ${fee}) -- press FUND FEE`;
      // Any participant may start the round once the table is legal.
      await bots[0].sendTx("assignRoles", [], 6_000_000n);
      return `assignRoles() sent -- ${count} players, roles now encrypted on Inco`;
    }

    case "Assigned":
    case "Night": {
      const players = await allPlayerAddresses();
      const round = await read<bigint>("round");
      for (const b of bots) {
        if (!(await b.isAlive())) continue;
        if (await read<boolean>("hasSubmittedNight", [b.address])) continue;
        const view = await buildView(b, mafiaCount);
        await b.submitNightAction(view, players);
      }
      const [subs, aliveCount] = await Promise.all([
        read<bigint>("nightSubmissions"),
        read<bigint>("aliveCount"),
      ]);
      if (subs < aliveCount) {
        return `Night ${round}: ${subs}/${aliveCount} actions in -- waiting on the human player(s)`;
      }
      await bots[0].sendTx("resolveNightStep1", [], 8_000_000n);
      return `Night ${round}: all actions in, resolveNightStep1() sent`;
    }

    case "NightPendingReveal": {
      const [vHandle, dHandle] = await Promise.all([
        read<`0x${string}`>("pendingVictimIndexHandle"),
        read<`0x${string}`>("pendingDeathFlagHandle"),
      ]);
      const [victim, dies] = await attestedReveal([vHandle, dHandle]);
      await bots[0].sendTx(
        "settleNight",
        [victim.value, victim.sigs, dies.value, dies.sigs],
        3_000_000n
      );
      return `settleNight() sent -- ${dies.value === 1n ? "someone died" : "everyone survived the night"}`;
    }

    case "NightRoleReveal":
    case "DayRoleReveal": {
      const dead = await read<Address>("pendingDeadPlayer");
      const handle = await read<`0x${string}`>("roleHandleOf", [dead]);
      const [role] = await attestedReveal([handle]);
      const fn = state === "NightRoleReveal" ? "settleNightRole" : "settleDayRole";
      await bots[0].sendTx(fn, [role.value, role.sigs], 2_000_000n);
      return `${fn}() sent -- ${short(dead)} is revealed as ${roleFromValue(role.value, mafiaCount)}`;
    }

    case "Day": {
      const round = await read<bigint>("round");
      for (const b of bots) {
        if (!(await b.isAlive())) continue;
        if (await read<boolean>("hasVotedDay", [b.address])) continue;
        const view = await buildView(b, mafiaCount);
        await b.castDayVote(view);
      }
      const [cast, aliveCount] = await Promise.all([
        read<bigint>("dayVotesCast"),
        read<bigint>("aliveCount"),
      ]);
      if (cast < aliveCount) {
        return `Day ${round}: ${cast}/${aliveCount} votes in -- waiting on the human player(s)`;
      }
      await bots[0].sendTx("resolveDayVote", [], 3_000_000n);
      return `Day ${round}: all votes in, resolveDayVote() sent`;
    }

    case "GameOver": {
      const winner = Number(await read<number>("winner"));
      return `GAME OVER -- ${winner === 1 ? "Town wins" : winner === 2 ? "Mafia wins" : "no winner"}`;
    }

    default:
      return `unhandled state ${state}`;
  }
}

async function main() {
  console.log(`Contract: ${CONTRACT}`);
  console.log(`AI players: ${bots.map((b) => `${b.name} ${short(b.address)}`).join(", ")}\n`);

  let lastStatus = "";
  for (;;) {
    try {
      const status = await tick();
      if (status !== lastStatus) {
        console.log(`${new Date().toISOString().slice(11, 19)}  ${status}`);
        lastStatus = status;
      }
      if (status.startsWith("GAME OVER")) return;
    } catch (e) {
      console.log(`  ! ${(e as Error).message?.slice(0, 200)}`);
    }
    if (ONCE) return;
    await sleep(10_000);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
