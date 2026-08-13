"use client";

// Raffle: one inco shuffle picks a hidden winner, revealed at the draw.
import { useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { formatEther, type Hex } from "viem";
import raffleAbi from "@/abi/Raffle.json";
import { ADDRESSES, txUrl, addrUrl, short } from "@/lib/games";
import { Card } from "@/components/Card";
import { Button, Step, TxBar } from "@/components/ui";
import { GameShell, NoAddress } from "@/components/GameShell";
import { readPublic } from "@/lib/deck";
import { celebrate } from "@/lib/confetti";
import { useTx } from "@/hooks/useTx";

const ADDR = ADDRESSES.raffle as `0x${string}`;
const abi = raffleAbi;

export default function RafflePage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [ticket, setTicket] = useState<number | null>(null);
  const [revealing, setRevealing] = useState(false);

  const one = { enabled: !!ADDR };
  const q = { enabled: !!ADDR, refetchInterval: 4000 };
  const { data: price } = useReadContract({ address: ADDR, abi, functionName: "ticketPrice", query: one });
  const { data: minRaw } = useReadContract({ address: ADDR, abi, functionName: "minEntrants", query: one });
  const { data: stateRaw, refetch: rState } = useReadContract({ address: ADDR, abi, functionName: "state", query: q });
  const { data: countRaw, refetch: rCount } = useReadContract({ address: ADDR, abi, functionName: "entrantCount", query: q });
  const { data: winner, refetch: rWinner } = useReadContract({ address: ADDR, abi, functionName: "winner", query: q });
  const { data: prize } = useReadContract({ address: ADDR, abi, functionName: "prize", query: q });

  const { send, busy, phase, hash } = useTx(() => { rState(); rCount(); rWinner(); });
  const state = stateRaw !== undefined ? Number(stateRaw) : -1; // 0 Selling 1 Drawing 2 Paid
  const count = Number(countRaw ?? 0);
  const min = Number(minRaw ?? 0);
  const iWon = !!address && !!winner && (winner as string).toLowerCase() === address.toLowerCase();

  // Celebrate if you drew the winning ticket; re-arm for the next round.
  const celebrated = useRef(false);
  useEffect(() => {
    if (state === 2 && iWon && !celebrated.current) { celebrated.current = true; void celebrate(); }
    if (state === 0) celebrated.current = false;
  }, [state, iWon]);

  if (!ADDR) return <NoAddress env="NEXT_PUBLIC_RAFFLE_ADDRESS" />;

  async function onDraw() {
    const fee = (await publicClient!.readContract({ address: ADDR, abi, functionName: "deckFee", args: [count] })) as bigint;
    send({ address: ADDR, abi, functionName: "draw", args: [], value: fee });
  }

  async function onSettle() {
    setRevealing(true);
    try {
      const handle = (await publicClient!.readContract({ address: ADDR, abi, functionName: "winningTicketHandle" })) as Hex;
      const [r] = await readPublic([handle]);
      setTicket(Number(r.value));
      send({ address: ADDR, abi, functionName: "settle", args: [r.value, r.sigs] });
    } finally {
      setRevealing(false);
    }
  }

  return (
    <GameShell slug="raffle">
      <div className="flex flex-col items-center gap-2 py-4">
        <Card faceUp={ticket !== null} label={ticket !== null ? `#${ticket}` : undefined} loading={revealing} hint="winning ticket" />
        <span className="text-sm text-muted-foreground">
          {count} ticket{count === 1 ? "" : "s"} sold{count < min ? ` - need ${min} to draw` : " - ready to draw"}
        </span>
      </div>

      <TxBar text={busy ? phase : revealing ? "revealing" : stateRaw === undefined ? "loading" : null} />

      <Step n={1} title="Buy a ticket">
        <Button disabled={busy || state !== 0}
          onClick={() => send({ address: ADDR, abi, functionName: "enter", args: [], value: price as bigint })}>
          Enter for {price ? formatEther(price as bigint) : "?"} ETH
        </Button>
      </Step>

      <Step n={2} title="Draw the winner">
        <Button variant="outline" disabled={busy || state !== 0 || count < min} onClick={onDraw}>
          Shuffle and draw
        </Button>
        {state === 0 && count < min && (
          <p className="text-xs text-muted-foreground">
            Need {min} tickets to draw ({count} so far) - buy from more wallets.
          </p>
        )}
      </Step>

      <Step n={3} title="Reveal ticket and pay">
        <Button disabled={busy || state !== 1} onClick={onSettle}>Reveal and settle</Button>
      </Step>

      {state === 2 && (
        <div className="border-2 border-primary bg-card/60 p-6 text-center text-sm">
          <div className="text-lg uppercase tracking-wide text-primary">{iWon ? "You won" : "Winner drawn"}</div>
          <div className="mt-1 text-muted-foreground">
            {prize ? formatEther(prize as bigint) : "?"} ETH to {short(winner as string)}
          </div>
          <a href={txUrl(hash) ?? addrUrl(ADDR)} target="_blank" rel="noopener noreferrer"
            className="mt-3 block text-[11px] uppercase tracking-widest text-muted-foreground hover:text-primary">
            view on basescan
          </a>
          <Button className="mt-4" disabled={busy}
            onClick={() => send({ address: ADDR, abi, functionName: "newRound", args: [] })}>
            New raffle
          </Button>
        </div>
      )}
    </GameShell>
  );
}
