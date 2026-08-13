"use client";

// War: two players, one private card each, higher rank wins. Auto-matchmaking:
// join drops you at an open table or opens a new one - never a wait.
import { useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient, useReadContract, useWalletClient } from "wagmi";
import { formatEther, type Hex } from "viem";
import { toast } from "sonner";
import warAbi from "@/abi/War.json";
import { ADDRESSES, txUrl, addrUrl } from "@/lib/games";
import { Card } from "@/components/Card";
import { Button, Step, TxBar } from "@/components/ui";
import { GameShell, NoAddress } from "@/components/GameShell";
import { decodeCard, peek, readPublic, toSettleArgs } from "@/lib/deck";
import { celebrate } from "@/lib/confetti";
import { useTx } from "@/hooks/useTx";

const ADDR = ADDRESSES.war as `0x${string}`;
const abi = warAbi;

export default function WarPage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [mine, setMine] = useState<string | null>(null);
  const [peeking, setPeeking] = useState(false);
  const [board, setBoard] = useState<{ c0?: string; c1?: string }>({});

  const q = { enabled: !!ADDR, refetchInterval: 4000 };
  const { data: bet } = useReadContract({ address: ADDR, abi, functionName: "bet", query: { enabled: !!ADDR } });
  const { data: myRoomRaw, refetch: rMyRoom } = useReadContract({
    address: ADDR, abi, functionName: "roomOfPlayer", args: [address ?? "0x0"], query: { enabled: !!ADDR && !!address, refetchInterval: 4000 },
  });
  const myRoom = myRoomRaw !== undefined ? Number(myRoomRaw) : null;
  const hasRoom = myRoom !== null && myRoom >= 0;

  const { data: roomRaw, refetch: rRoom } = useReadContract({
    address: ADDR, abi, functionName: "roomOf", args: [BigInt(hasRoom ? myRoom! : 0)], query: { enabled: !!ADDR && hasRoom, refetchInterval: 4000 },
  });
  const { data: payoutRaw, refetch: rPayout } = useReadContract({
    address: ADDR, abi, functionName: "payout", args: [address ?? "0x0"], query: { enabled: !!ADDR && !!address, refetchInterval: 4000 },
  });

  const { send, busy, phase, hash } = useTx(() => { rMyRoom(); rRoom(); rPayout(); });

  const room = roomRaw as unknown as [string, string, number, number, number, bigint] | undefined;
  const [p0, p1, seated, winnerSeat, state] = room ?? ["", "", 0, 3, hasRoom ? 0 : -1];
  const mySeat = address && room ? [p0, p1].findIndex((s) => s?.toLowerCase() === address.toLowerCase()) : -1;
  const payout = (payoutRaw as bigint) ?? 0n;
  const rid = BigInt(hasRoom ? myRoom! : 0);

  // After showdown (state >= 2) both cards are public - load them so both flip up.
  useEffect(() => {
    if (!ADDR || !hasRoom || Number(state) < 2) return;
    let cancel = false;
    (async () => {
      for (let i = 0; i < 10 && !cancel; i++) {
        try {
          const h0 = (await publicClient!.readContract({ address: ADDR, abi, functionName: "cardHandle", args: [rid, 0] })) as Hex;
          const h1 = (await publicClient!.readContract({ address: ADDR, abi, functionName: "cardHandle", args: [rid, 1] })) as Hex;
          const [a, b] = await readPublic([h0, h1]);
          if (!cancel) setBoard({ c0: decodeCard(a.value).label, c1: decodeCard(b.value).label });
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    })();
    return () => { cancel = true; };
  }, [state, hasRoom, publicClient]);

  // Celebrate your win once per hand; re-arm before the next hand settles.
  const celebrated = useRef(false);
  useEffect(() => {
    const st = Number(state);
    if (st === 3 && mySeat >= 0 && winnerSeat === mySeat && !celebrated.current) { celebrated.current = true; void celebrate(); }
    if (st < 3) celebrated.current = false;
  }, [state, winnerSeat, mySeat]);

  if (!ADDR) return <NoAddress env="NEXT_PUBLIC_WAR_ADDRESS" />;

  const st = Number(state); // -1 none, 0 Open, 1 Dealt, 2 Revealing, 3 Done
  const joinAndReset = () => { setMine(null); setBoard({}); send({ address: ADDR, abi, functionName: "join", args: [], value: bet as bigint }); };

  async function onPeek() {
    if (!walletClient || mySeat < 0) return;
    setPeeking(true);
    try {
      const h = (await publicClient!.readContract({ address: ADDR, abi, functionName: "cardHandle", args: [rid, mySeat] })) as Hex;
      const [c] = await peek(walletClient, [h]);
      setMine(decodeCard(c.value).label);
      toast.success("Only you can see this card");
    } catch {
      toast.error("Peek failed - wait for the covalidator, then retry");
    }
    setPeeking(false);
  }

  async function onSettle() {
    const h0 = (await publicClient!.readContract({ address: ADDR, abi, functionName: "cardHandle", args: [rid, 0] })) as Hex;
    const h1 = (await publicClient!.readContract({ address: ADDR, abi, functionName: "cardHandle", args: [rid, 1] })) as Hex;
    const { values, sigs } = toSettleArgs(await readPublic([h0, h1]));
    send({ address: ADDR, abi, functionName: "settle", args: [rid, [values[0], values[1]], [sigs[0], sigs[1]]] });
  }

  const isRed = (l?: string) => (l ? l.endsWith("♦") || l.endsWith("♥") : false);
  const c0 = st >= 2 ? board.c0 : mySeat === 0 ? mine ?? undefined : undefined;
  const c1 = st >= 2 ? board.c1 : mySeat === 1 ? mine ?? undefined : undefined;
  const won = st === 3 && (winnerSeat === 2 || winnerSeat === mySeat);

  return (
    <GameShell slug="war">
      {hasRoom && (
        <>
          <div className="text-center text-[11px] uppercase tracking-widest text-muted-foreground">table #{myRoom}</div>
          <div className="flex justify-center gap-8 py-2">
            <Card faceUp={!!c0} label={c0} red={isRed(c0)} loading={peeking && mySeat === 0} hint={mySeat === 0 ? "you" : "opponent"} />
            <Card faceUp={!!c1} label={c1} red={isRed(c1)} loading={peeking && mySeat === 1} hint={mySeat === 1 ? "you" : "opponent"} />
          </div>
        </>
      )}

      <TxBar text={busy ? phase : myRoomRaw === undefined && address ? "finding your table" : null} />

      {(!hasRoom || st === 3) && (
        <Step n={1} title={hasRoom ? "Play again" : "Join a table"}>
          <Button disabled={busy} onClick={joinAndReset}>
            {hasRoom ? "New game" : "Join"} for {bet ? formatEther(bet as bigint) : "?"} ETH
          </Button>
          <p className="text-xs text-muted-foreground">You are matched to an open table, or a new one opens for you.</p>
        </Step>
      )}

      {hasRoom && st === 0 && (
        <Step n={2} title="Waiting for an opponent">
          <p className="text-xs text-muted-foreground">Seated at table #{myRoom}. The hand deals when a 2nd player joins.</p>
        </Step>
      )}

      {hasRoom && st >= 1 && st < 3 && (
        <>
          <Step n={2} title="Peek your card (private)">
            <Button variant="outline" disabled={peeking || mySeat < 0 || st < 1} onClick={onPeek}>
              {peeking ? "Decrypting..." : "Peek my card"}
            </Button>
          </Step>
          <Step n={3} title="Reveal both, then settle">
            <div className="flex gap-3">
              <Button variant="outline" disabled={busy || st !== 1}
                onClick={() => send({ address: ADDR, abi, functionName: "showdown", args: [rid] })}>
                Reveal both
              </Button>
              <Button disabled={busy || st !== 2} onClick={onSettle}>Settle</Button>
            </div>
          </Step>
        </>
      )}

      {st === 3 && (
        <div className="border-2 border-primary bg-card/60 p-6 text-center">
          <div className="text-lg uppercase tracking-wide text-primary">
            {winnerSeat === 2 ? "Split pot" : winnerSeat === mySeat ? "You win" : "You lose"}
          </div>
          {won && payout > 0n && (
            <Button className="mt-3" disabled={busy}
              onClick={() => send({ address: ADDR, abi, functionName: "claim", args: [] })}>
              Claim {formatEther(payout)} ETH
            </Button>
          )}
          <a href={txUrl(hash) ?? addrUrl(ADDR)} target="_blank" rel="noopener noreferrer"
            className="mt-3 block text-[11px] uppercase tracking-widest text-muted-foreground hover:text-primary">
            view on basescan
          </a>
        </div>
      )}
    </GameShell>
  );
}
