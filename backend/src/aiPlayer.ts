// Gemini-driven Mafia player.
//
// The confidentiality story of this project is that a player's role and their
// night action are encrypted on Inco and are not knowable by anyone else. An
// AI player has to live under exactly the same constraint as a human one, or
// the demo is a lie. So this agent is built so that the only private thing it
// can ever see is *its own* role, obtained the same way a human's browser
// does it: read `roleHandleOf(me)` off the contract, then run Inco's
// `attestedDecrypt` signed by this agent's own key. There is no path here that
// reads another player's role -- the contract wouldn't authorize the decrypt
// even if we asked.
//
// Everything else the model reasons over is public chain state: who is seated,
// who is alive, who died and which role that death revealed, the round number,
// and the public day-vote tally. That is precisely the information a human
// player at the table has.

import { Lightning } from "@inco/lightning-js/lite";
import {
  createPublicClient,
  createWalletClient,
  getContract,
  http,
  bytesToHex,
  type Abi,
  type Address,
} from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

export type Role = "Mafia" | "Doctor" | "Villager";

/** Public-only snapshot of the table, plus this agent's own role. Mirrors what
 * a human sees in the Mini App. */
export interface TableView {
  round: number;
  me: Address;
  myRole: Role;
  players: { address: Address; alive: boolean; isMe: boolean }[];
  deaths: { address: Address; revealedRole: Role; round: number }[];
  dayVotes?: { address: Address; votes: number }[];
}

const GEMINI_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

function shortAddr(a: string) {
  return `${a.slice(0, 6)}..${a.slice(-4)}`;
}

/** Turns a role's numeric encoding into a name. Encoding (see the contract):
 * value <= mafiaCount is Mafia, value == mafiaCount + 1 is Doctor, else
 * Villager. */
export function roleFromValue(value: bigint, mafiaCount: number): Role {
  if (value <= BigInt(mafiaCount)) return "Mafia";
  if (value === BigInt(mafiaCount + 1)) return "Doctor";
  return "Villager";
}

export class AiPlayer {
  readonly address: Address;
  readonly name: string;
  private readonly account;
  private readonly publicClient;
  private readonly walletClient;
  private readonly contract;
  private readonly abi: Abi;
  private readonly contractAddress: Address;
  private readonly geminiKey: string;
  private readonly geminiModel: string;
  private cachedRole: Role | null = null;

  constructor(opts: {
    name: string;
    privateKey: `0x${string}`;
    rpcUrl: string;
    contractAddress: Address;
    abi: Abi;
    geminiKey: string;
    geminiModel?: string;
  }) {
    this.name = opts.name;
    this.account = privateKeyToAccount(opts.privateKey);
    this.address = this.account.address;
    this.abi = opts.abi;
    this.contractAddress = opts.contractAddress;
    this.geminiKey = opts.geminiKey;
    this.geminiModel = opts.geminiModel ?? "gemini-2.5-flash";

    this.publicClient = createPublicClient({ chain: baseSepolia, transport: http(opts.rpcUrl) });
    this.walletClient = createWalletClient({
      account: this.account,
      chain: baseSepolia,
      transport: http(opts.rpcUrl),
    });
    this.contract = getContract({
      address: opts.contractAddress,
      abi: opts.abi,
      client: { public: this.publicClient, wallet: this.walletClient },
    });
  }

  private log(msg: string) {
    console.log(`[${this.name} ${shortAddr(this.address)}] ${msg}`);
  }

  async read<T>(fn: string, args: unknown[] = []): Promise<T> {
    return this.publicClient.readContract({
      address: this.contractAddress,
      abi: this.abi,
      functionName: fn,
      args,
    }) as Promise<T>;
  }

  /** Explicit gas limits everywhere: any call touching Inco's precompiles
   * makes eth_estimateGas fail (StackUnderflow), so estimation is bypassed. */
  /** Public because the runner also drives the protocol's non-secret steps
   * (resolveNightStep1, settleNight, ...) through one of the agents. */
  async sendTx(fn: string, args: unknown[], gas: bigint) {
    const hash = await this.walletClient.writeContract({
      address: this.contractAddress,
      abi: this.abi,
      functionName: fn,
      args,
      gas,
      chain: baseSepolia,
      account: this.account,
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${fn} reverted (${hash})`);
    return hash;
  }

  async isSeated(): Promise<boolean> {
    return this.read<boolean>("seated", [this.address]);
  }

  async isAlive(): Promise<boolean> {
    return this.read<boolean>("alive", [this.address]);
  }

  async join() {
    if (await this.isSeated()) {
      this.log("already seated");
      return;
    }
    await this.sendTx("join", [], 300_000n);
    this.log("joined the lobby");
  }

  /** Reads *own* role only. The contract's per-player ACL is what makes this
   * safe: attestedDecrypt is authorized for the handle's owner, so this same
   * code pointed at another player's handle would simply fail. */
  async revealOwnRole(mafiaCount: number): Promise<Role> {
    if (this.cachedRole) return this.cachedRole;
    const handle = await this.read<`0x${string}`>("roleHandleOf", [this.address]);
    const zap = await Lightning.baseSepoliaTestnet();
    const [res] = await zap.attestedDecrypt(this.walletClient, [handle]);
    const value = BigInt((res as { plaintext: { value: string | bigint } }).plaintext.value);
    this.cachedRole = roleFromValue(value, mafiaCount);
    this.log(`decrypted own role: ${this.cachedRole}`);
    return this.cachedRole;
  }

  /** Asks Gemini for a target. Returns an index into `candidates`. Falls back
   * to a random candidate if the model is unavailable or answers nonsense --
   * an AI outage must never stall a live on-chain game. */
  private async decide(view: TableView, phase: "night" | "day", candidates: Address[]): Promise<number> {
    const roster = view.players
      .map((p) => `- ${shortAddr(p.address)}${p.isMe ? " (me)" : ""}: ${p.alive ? "alive" : "dead"}`)
      .join("\n");
    const deaths = view.deaths.length
      ? view.deaths.map((d) => `- ${shortAddr(d.address)} died in round ${d.round}, was ${d.revealedRole}`).join("\n")
      : "- nobody has died yet";
    const votes = view.dayVotes?.length
      ? view.dayVotes.map((v) => `- ${shortAddr(v.address)}: ${v.votes} vote(s)`).join("\n")
      : "- no votes cast yet this day";

    const goal =
      view.myRole === "Mafia"
        ? "You are Mafia. At night you pick who to kill. By day you blend in and steer the lynch away from yourself."
        : view.myRole === "Doctor"
          ? "You are the Doctor. At night you pick one player to protect from the Mafia's kill (you may protect yourself). By day you help find the Mafia without exposing that you are the Doctor."
          : "You are a Villager. You have no night power -- your night action is recorded but does nothing. By day you reason about who is Mafia.";

    const task =
      phase === "night"
        ? "Choose ONE living player to target tonight."
        : "Choose ONE living player to vote to lynch today.";

    const prompt = `You are playing Mafia (social deduction) on-chain. ${goal}

Round: ${view.round}
Players:
${roster}

Deaths so far (a death always publicly reveals that player's role):
${deaths}

Public day-vote tally:
${votes}

${task}
Choose from exactly these candidates (reply with the NUMBER only):
${candidates.map((c, i) => `${i}. ${shortAddr(c)}${c === view.me ? " (me)" : ""}`).join("\n")}

Reply with a single integer and nothing else.`;

    try {
      const r = await fetch(`${GEMINI_URL(this.geminiModel)}?key=${this.geminiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      if (!r.ok) throw new Error(`gemini HTTP ${r.status}`);
      const data = (await r.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const n = Number.parseInt(text.match(/\d+/)?.[0] ?? "", 10);
      if (Number.isInteger(n) && n >= 0 && n < candidates.length) {
        this.log(`Gemini chose ${shortAddr(candidates[n])} for the ${phase}`);
        return n;
      }
      throw new Error(`unusable answer: ${text.slice(0, 60)}`);
    } catch (e) {
      const n = Math.floor(Math.random() * candidates.length);
      this.log(`Gemini unavailable (${(e as Error).message}); falling back to ${shortAddr(candidates[n])}`);
      return n;
    }
  }

  async submitNightAction(view: TableView, allPlayers: Address[]) {
    if (await this.read<boolean>("hasSubmittedNight", [this.address])) {
      this.log("night action already submitted");
      return;
    }
    // Mafia shouldn't target itself; everyone else may target anyone alive.
    const living = view.players.filter((p) => p.alive);
    const candidates = living
      .filter((p) => (view.myRole === "Mafia" ? !p.isMe : true))
      .map((p) => p.address);
    const pick = candidates[await this.decide(view, "night", candidates)];
    const targetIndex = allPlayers.findIndex((a) => a.toLowerCase() === pick.toLowerCase());
    await this.sendTx("submitNightAction", [targetIndex], 1_500_000n);
    this.log(`submitted night action (target hidden on-chain)`);
  }

  async castDayVote(view: TableView) {
    if (await this.read<boolean>("hasVotedDay", [this.address])) {
      this.log("day vote already cast");
      return;
    }
    const candidates = view.players.filter((p) => p.alive && !p.isMe).map((p) => p.address);
    if (!candidates.length) return;
    const pick = candidates[await this.decide(view, "day", candidates)];
    await this.sendTx("castDayVote", [pick], 400_000n);
    this.log(`voted publicly to lynch ${shortAddr(pick)}`);
  }
}

/** Fetches a covalidator-signed public reveal for handles the contract has
 * already made publicly revealable, and formats it for the settle* calls. */
export async function attestedReveal(handles: `0x${string}`[], tries = 15, delayMs = 4000) {
  const zap = await Lightning.baseSepoliaTestnet();
  for (let i = 0; ; i++) {
    try {
      const results = await zap.attestedReveal(handles);
      return results.map((r: { plaintext: { value: string | bigint }; covalidatorSignatures: Uint8Array[] }) => ({
        value: BigInt(r.plaintext.value),
        sigs: r.covalidatorSignatures.map((s) => bytesToHex(s)),
      }));
    } catch (err) {
      if (i === tries - 1) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
