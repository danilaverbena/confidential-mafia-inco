"use client";

// Confidential Mafia: hidden roles AND hidden night actions. Every living
// player submits a night action in the same shape (an index), and the
// contract alone decides -- from each sender's encrypted role -- whether it
// counts as a kill vote, a doctor's save, or nothing. Only the folded
// outcome is ever revealed: who died, if anyone, and (only then) their role.
import { useMemo, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useSendTransaction,
  useWalletClient,
} from "wagmi";
import { type Hex, type Abi } from "viem";
import { toast } from "sonner";
import confidentialMafiaAbi from "@/abi/ConfidentialMafia.json";
import { ADDRESSES, short } from "@/lib/games";
import { Button, Panel, Step, TxBar } from "@/components/ui";
import { GameShell, NoAddress } from "@/components/GameShell";
import { peek, readPublic } from "@/lib/deck";
import { useTx } from "@/hooks/useTx";

const ADDR = ADDRESSES["confidential-mafia"] as `0x${string}`;
const abi = confidentialMafiaAbi as Abi;

const STATE_NAMES = [
  "Joining",
  "Roles assigned",
  "Night",
  "Night (resolving)",
  "Night (role reveal)",
  "Day",
  "Day (role reveal)",
  "Game over",
] as const;

function roleName(value: bigint | number, mafiaCount: bigint | number): string {
  const v = Number(value);
  const m = Number(mafiaCount);
  if (v <= m) return "MAFIA";
  if (v === m + 1) return "DOCTOR";
  return "VILLAGER";
}

export default function ConfidentialMafiaPage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { sendTransaction } = useSendTransaction();

  const [role, setRole] = useState<string | null>(null);
  const [peeking, setPeeking] = useState(false);
  const [target, setTarget] = useState<number | null>(null);
  const [settling, setSettling] = useState(false);

  const q = { enabled: !!ADDR, refetchInterval: 4000 };
  const qAddr = { enabled: !!ADDR && !!address, refetchInterval: 4000 };

  const { data: stateRaw, refetch: rState } = useReadContract({ address: ADDR, abi, functionName: "state", query: q });
  const { data: countRaw, refetch: rCount } = useReadContract({ address: ADDR, abi, functionName: "playerCount", query: q });
  const { data: mafiaCount } = useReadContract({ address: ADDR, abi, functionName: "mafiaCount", query: { enabled: !!ADDR } });
  const { data: aliveCount } = useReadContract({ address: ADDR, abi, functionName: "aliveCount", query: q });
  const { data: aliveMafiaCount } = useReadContract({ address: ADDR, abi, functionName: "aliveMafiaCount", query: q });
  const { data: winnerRaw } = useReadContract({ address: ADDR, abi, functionName: "winner", query: q });
  const { data: nightSubmissions } = useReadContract({ address: ADDR, abi, functionName: "nightSubmissions", query: q });
  const { data: dayVotesCast } = useReadContract({ address: ADDR, abi, functionName: "dayVotesCast", query: q });
  const { data: pendingDeadPlayer } = useReadContract({ address: ADDR, abi, functionName: "pendingDeadPlayer", query: q });
  const { data: seated, refetch: rSeated } = useReadContract({ address: ADDR, abi, functionName: "seated", args: [address ?? "0x0000000000000000000000000000000000000000"], query: qAddr });
  const { data: youAlive, refetch: rYouAlive } = useReadContract({ address: ADDR, abi, functionName: "alive", args: [address ?? "0x0000000000000000000000000000000000000000"], query: qAddr });
  const { data: hasSubmitted, refetch: rHasSubmitted } = useReadContract({ address: ADDR, abi, functionName: "hasSubmittedNight", args: [address ?? "0x0000000000000000000000000000000000000000"], query: qAddr });
  const { data: hasVoted, refetch: rHasVoted } = useReadContract({ address: ADDR, abi, functionName: "hasVotedDay", args: [address ?? "0x0000000000000000000000000000000000000000"], query: qAddr });

  const state = stateRaw !== undefined ? Number(stateRaw) : -1;
  const count = Number(countRaw ?? 0);

  const playerIndexContracts = useMemo(
    () => Array.from({ length: count }, (_, i) => ({ address: ADDR, abi, functionName: "players", args: [BigInt(i)] }) as const),
    [count],
  );
  const { data: playersRaw, refetch: rPlayers } = useReadContracts({ contracts: playerIndexContracts, query: { enabled: !!ADDR && count > 0, refetchInterval: 4000 } });
  const players = (playersRaw ?? []).map((r) => r.result as `0x${string}` | undefined).filter((p): p is `0x${string}` => !!p);

  const aliveContracts = useMemo(
    () => players.map((p) => ({ address: ADDR, abi, functionName: "alive", args: [p] }) as const),
    [players],
  );
  const { data: aliveRaw, refetch: rAliveList } = useReadContracts({ contracts: aliveContracts, query: { enabled: !!ADDR && players.length > 0, refetchInterval: 4000 } });
  const aliveFlags = (aliveRaw ?? []).map((r) => Boolean(r.result));

  const voteTallyContracts = useMemo(
    () => players.map((p) => ({ address: ADDR, abi, functionName: "voteTally", args: [p] }) as const),
    [players],
  );
  const { data: voteTallyRaw } = useReadContracts({ contracts: voteTallyContracts, query: { enabled: !!ADDR && state === 5 && players.length > 0, refetchInterval: 4000 } });
  const voteTallies = (voteTallyRaw ?? []).map((r) => Number(r.result ?? 0));

  function refetchAll() {
    rState();
    rCount();
    rSeated();
    rYouAlive();
    rHasSubmitted();
    rHasVoted();
    rPlayers();
    rAliveList();
  }

  const { send, busy, phase } = useTx(refetchAll);

  if (!ADDR) return <NoAddress env="NEXT_PUBLIC_CONFIDENTIAL_MAFIA_ADDRESS" />;

  async function onFund() {
    const fee = (await publicClient!.readContract({ address: ADDR, abi, functionName: "deckFee", args: [count] })) as bigint;
    sendTransaction({ to: ADDR, value: fee });
    toast.success("Funded the shuffle fee");
  }

  async function onRevealRole() {
    if (!walletClient || !address) return;
    setPeeking(true);
    try {
      const handle = (await publicClient!.readContract({ address: ADDR, abi, functionName: "roleHandleOf", args: [address] })) as Hex;
      const [r] = await peek(walletClient, [handle]);
      setRole(roleName(r.value, (mafiaCount as bigint) ?? 1n));
    } catch {
      toast.error("Reveal failed - wait for the covalidator, then retry");
    }
    setPeeking(false);
  }

  function onSubmitNight() {
    if (target === null) return;
    send({ address: ADDR, abi, functionName: "submitNightAction", args: [target], gas: 1_500_000n });
  }

  function onResolveNight() {
    send({ address: ADDR, abi, functionName: "resolveNightStep1", args: [], gas: 2_000_000n });
  }

  async function onSettleNight() {
    setSettling(true);
    try {
      const victimHandle = (await publicClient!.readContract({ address: ADDR, abi, functionName: "pendingVictimIndexHandle" })) as Hex;
      const deathHandle = (await publicClient!.readContract({ address: ADDR, abi, functionName: "pendingDeathFlagHandle" })) as Hex;
      const [victim, dies] = await readPublic([victimHandle, deathHandle]);
      send({
        address: ADDR,
        abi,
        functionName: "settleNight",
        args: [victim.value, victim.sigs, dies.value, dies.sigs],
        gas: 2_000_000n,
      });
    } catch {
      toast.error("Reveal not attested yet - wait a few seconds and retry");
    }
    setSettling(false);
  }

  async function onSettleNightRole() {
    if (!pendingDeadPlayer) return;
    setSettling(true);
    try {
      const roleHandle = (await publicClient!.readContract({ address: ADDR, abi, functionName: "roleHandleOf", args: [pendingDeadPlayer] })) as Hex;
      const [r] = await readPublic([roleHandle]);
      send({ address: ADDR, abi, functionName: "settleNightRole", args: [r.value, r.sigs], gas: 2_000_000n });
    } catch {
      toast.error("Reveal not attested yet - wait a few seconds and retry");
    }
    setSettling(false);
  }

  function onCastVote(targetAddr: `0x${string}`) {
    send({ address: ADDR, abi, functionName: "castDayVote", args: [targetAddr] });
  }

  function onResolveDay() {
    send({ address: ADDR, abi, functionName: "resolveDayVote", args: [] });
  }

  async function onSettleDayRole() {
    if (!pendingDeadPlayer) return;
    setSettling(true);
    try {
      const roleHandle = (await publicClient!.readContract({ address: ADDR, abi, functionName: "roleHandleOf", args: [pendingDeadPlayer] })) as Hex;
      const [r] = await readPublic([roleHandle]);
      send({ address: ADDR, abi, functionName: "settleDayRole", args: [r.value, r.sigs], gas: 2_000_000n });
    } catch {
      toast.error("Reveal not attested yet - wait a few seconds and retry");
    }
    setSettling(false);
  }

  const winnerName = winnerRaw === 1 ? "Town" : winnerRaw === 2 ? "Mafia" : null;
  const nightDone = nightSubmissions !== undefined && aliveCount !== undefined && Number(nightSubmissions) === Number(aliveCount) && Number(aliveCount) > 0;
  const dayDone = dayVotesCast !== undefined && aliveCount !== undefined && Number(dayVotesCast) === Number(aliveCount) && Number(aliveCount) > 0;

  return (
    <GameShell slug="confidential-mafia">
      <Panel className="flex flex-col items-center gap-1 text-center">
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          Phase: {STATE_NAMES[state] ?? "loading"}
        </span>
        <span className="text-sm">
          {count} seated - {String(aliveCount ?? "-")} alive - {String(aliveMafiaCount ?? "-")} mafia alive
        </span>
      </Panel>

      <TxBar text={busy ? phase : settling ? "fetching attested reveal" : null} />

      {state === 0 && (
        <>
          <Step n={1} title="Join the lobby">
            <Button disabled={busy || seated === true} onClick={() => send({ address: ADDR, abi, functionName: "join", args: [] })}>
              {seated ? "Already joined" : "Join"}
            </Button>
            {players.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {players.map((p) => (
                  <li key={p}>{short(p)}</li>
                ))}
              </ul>
            )}
          </Step>
          <Step n={2} title="Fund the shuffle fee, then assign roles">
            <div className="flex gap-3">
              <Button variant="outline" disabled={count < 1} onClick={onFund}>
                Fund fee
              </Button>
              <Button
                disabled={busy || count < Number(mafiaCount ?? 1) + 2}
                onClick={() => send({ address: ADDR, abi, functionName: "assignRoles", args: [], gas: 3_000_000n })}
              >
                Assign roles
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Need at least {Number(mafiaCount ?? 1) + 2} players (mafia + doctor + 1 more). Currently {count}.
            </p>
          </Step>
        </>
      )}

      {state >= 1 && state < 7 && (
        <Step n={3} title="Your secret role">
          <Button variant="outline" disabled={peeking} onClick={onRevealRole}>
            {peeking ? "Decrypting..." : role ? `You are ${role}` : "Reveal my role"}
          </Button>
          {role && (
            <p className="text-xs text-muted-foreground">
              Only you learned this. The contract decides what your night action means from this
              value -- nobody else, including this app and its backend narrator, ever sees it.
            </p>
          )}
        </Step>
      )}

      {state === 2 && youAlive === true && (
        <Step n={4} title="Night: choose a target">
          <div className="flex flex-col gap-2">
            {players.map((p, i) =>
              aliveFlags[i] ? (
                <label key={p} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="target" checked={target === i} onChange={() => setTarget(i)} disabled={hasSubmitted === true} />
                  {short(p)} {p === address ? "(you)" : ""}
                </label>
              ) : null,
            )}
          </div>
          <Button disabled={busy || hasSubmitted === true || target === null} onClick={onSubmitNight}>
            {hasSubmitted ? "Action submitted" : "Submit night action"}
          </Button>
          <p className="text-xs text-muted-foreground">
            {String(nightSubmissions ?? 0)}/{String(aliveCount ?? "-")} players have acted. Everyone
            submits the same way regardless of role -- that is what keeps the mafia and doctor
            hidden.
          </p>
        </Step>
      )}

      {state === 2 && nightDone && (
        <Step n={5} title="Resolve the night">
          <Button disabled={busy} onClick={onResolveNight}>
            Resolve night
          </Button>
        </Step>
      )}

      {state === 3 && (
        <Step n={5} title="Fetch the attested outcome and settle">
          <Button disabled={busy || settling} onClick={onSettleNight}>
            {settling ? "Fetching attestation..." : "Settle night"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Only the folded outcome (who died, if anyone) gets attested and revealed here -- never
            an individual vote or role.
          </p>
        </Step>
      )}

      {state === 4 && (
        <Step n={6} title="Reveal the dead player's role">
          <p className="text-sm">{short(pendingDeadPlayer as string | undefined)} did not survive the night.</p>
          <Button disabled={busy || settling} onClick={onSettleNightRole}>
            {settling ? "Fetching attestation..." : "Reveal role & settle"}
          </Button>
        </Step>
      )}

      {state === 5 && (
        <Step n={7} title="Day: vote to lynch">
          <div className="flex flex-col gap-2">
            {players.map((p, i) =>
              aliveFlags[i] ? (
                <div key={p} className="flex items-center justify-between text-sm">
                  <span>
                    {short(p)} {p === address ? "(you)" : ""} - {voteTallies[i] ?? 0} votes
                  </span>
                  <Button variant="outline" disabled={busy || hasVoted === true} onClick={() => onCastVote(p)}>
                    Vote
                  </Button>
                </div>
              ) : null,
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {String(dayVotesCast ?? 0)}/{String(aliveCount ?? "-")} votes cast. Day votes are public,
            same as a real game of Mafia.
          </p>
          {dayDone && (
            <Button disabled={busy} onClick={onResolveDay}>
              Resolve vote
            </Button>
          )}
        </Step>
      )}

      {state === 6 && (
        <Step n={8} title="Reveal the lynched player's role">
          <p className="text-sm">{short(pendingDeadPlayer as string | undefined)} was lynched.</p>
          <Button disabled={busy || settling} onClick={onSettleDayRole}>
            {settling ? "Fetching attestation..." : "Reveal role & settle"}
          </Button>
        </Step>
      )}

      {state === 7 && (
        <Step n={9} title="Game over">
          <p className="text-lg uppercase tracking-wide text-primary">{winnerName ?? "?"} wins</p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setRole(null);
              send({ address: ADDR, abi, functionName: "reset", args: [] });
            }}
          >
            New round
          </Button>
          <p className="text-xs text-muted-foreground">Reopens joining for a fresh set of players.</p>
        </Step>
      )}
    </GameShell>
  );
}
