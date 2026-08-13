"use client";

// Mafia: each player is privately dealt a role only they can decrypt.
import { useState } from "react";
import { useAccount, usePublicClient, useReadContract, useSendTransaction, useWalletClient } from "wagmi";
import { type Hex } from "viem";
import { toast } from "sonner";
import mafiaAbi from "@/abi/Mafia.json";
import { ADDRESSES } from "@/lib/games";
import { Card } from "@/components/Card";
import { Button, Step, TxBar } from "@/components/ui";
import { GameShell, NoAddress } from "@/components/GameShell";
import { peek } from "@/lib/deck";
import { useTx } from "@/hooks/useTx";

const ADDR = ADDRESSES.mafia as `0x${string}`;
const abi = mafiaAbi;

export default function MafiaPage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { sendTransaction } = useSendTransaction();
  const [role, setRole] = useState<string | null>(null);
  const [peeking, setPeeking] = useState(false);

  const q = { enabled: !!ADDR, refetchInterval: 4000 };
  const { data: stateRaw, refetch: rState } = useReadContract({ address: ADDR, abi, functionName: "state", query: q });
  const { data: countRaw, refetch: rCount } = useReadContract({ address: ADDR, abi, functionName: "playerCount", query: q });
  const { data: mafiaCount } = useReadContract({ address: ADDR, abi, functionName: "mafiaCount", query: { enabled: !!ADDR } });
  const { data: seated, refetch: rSeated } = useReadContract({
    address: ADDR, abi, functionName: "seated", args: [address ?? "0x0"], query: { enabled: !!ADDR && !!address, refetchInterval: 4000 },
  });

  const { send, busy, phase } = useTx(() => { rState(); rCount(); rSeated(); });
  const state = stateRaw !== undefined ? Number(stateRaw) : -1; // 0 Joining 1 Assigned
  const count = Number(countRaw ?? 0);

  if (!ADDR) return <NoAddress env="NEXT_PUBLIC_MAFIA_ADDRESS" />;

  async function onFund() {
    const fee = (await publicClient!.readContract({ address: ADDR, abi, functionName: "deckFee", args: [count] })) as bigint;
    sendTransaction({ to: ADDR, value: fee });
    toast.success("Funded the shuffle fee");
  }

  async function onReveal() {
    if (!walletClient || !address) return;
    setPeeking(true);
    try {
      const handle = (await publicClient!.readContract({ address: ADDR, abi, functionName: "roleHandleOf", args: [address] })) as Hex;
      const [r] = await peek(walletClient, [handle]);
      setRole(Number(r.value) <= Number(mafiaCount ?? 1) ? "MAFIA" : "TOWN");
    } catch {
      toast.error("Reveal failed - wait for the covalidator, then retry");
    }
    setPeeking(false);
  }

  return (
    <GameShell slug="mafia">
      <div className="flex flex-col items-center gap-2 py-4">
        <Card faceUp={role !== null} label={role ?? undefined} red={role === "MAFIA"} loading={peeking} hint="your role" />
        <span className="text-sm text-muted-foreground">{count} players seated</span>
      </div>

      <TxBar text={busy ? phase : stateRaw === undefined ? "loading" : null} />

      <Step n={1} title="Join the game">
        <Button disabled={busy || state !== 0 || seated === true}
          onClick={() => send({ address: ADDR, abi, functionName: "join", args: [] })}>
          Join
        </Button>
      </Step>

      <Step n={2} title="Fund the shuffle, then assign roles">
        <div className="flex gap-3">
          <Button variant="outline" disabled={state !== 0 || count < 2} onClick={onFund}>Fund fee</Button>
          <Button disabled={busy || state !== 0 || count <= Number(mafiaCount ?? 1)}
            onClick={() => send({ address: ADDR, abi, functionName: "assignRoles", args: [] })}>
            Assign roles
          </Button>
        </div>
        {state === 0 && count <= Number(mafiaCount ?? 1) && (
          <p className="text-xs text-muted-foreground">
            Need at least {Number(mafiaCount ?? 1) + 1} players - open more wallets to join.
          </p>
        )}
      </Step>

      <Step n={3} title="Reveal your secret role (private)">
        <Button variant="outline" disabled={peeking || state !== 1} onClick={onReveal}>
          {peeking ? "Decrypting..." : "Reveal my role"}
        </Button>
      </Step>

      {role && (
        <div className="border-2 border-primary bg-card/60 p-6 text-center">
          <div className="text-lg uppercase tracking-wide text-primary">You are {role}</div>
          <p className="mt-2 text-xs text-muted-foreground">
            Only you learned this - everyone else sees an opaque handle. This demo covers the
            confidential role deal; the rest of Mafia (discussion, accusations, voting) is played
            off-chain.
          </p>
        </div>
      )}

      {state === 1 && (
        <Step n={4} title="Play again">
          <Button variant="outline" disabled={busy}
            onClick={() => { setRole(null); send({ address: ADDR, abi, functionName: "reset", args: [] }); }}>
            New game
          </Button>
          <p className="text-xs text-muted-foreground">Reopens joining for a fresh set of players.</p>
        </Step>
      )}
    </GameShell>
  );
}
