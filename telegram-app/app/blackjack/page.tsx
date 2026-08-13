"use client";

// Blackjack vs the house. Your cards are face-up (no signature to view); the
// dealer's hole card + the shoe stay secret until you stand. The only wallet
// prompts are the moves themselves (deal / hit / stand).
import { useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { formatEther, parseEther, type Hex } from "viem";
import bjAbi from "@/abi/Blackjack.json";
import { ADDRESSES, txUrl, addrUrl } from "@/lib/games";
import { Card } from "@/components/Card";
import { Button, Step, TxBar, FullScreenLoader } from "@/components/ui";
import { GameShell, NoAddress } from "@/components/GameShell";
import { decodeCard, readPublic, toSettleArgs } from "@/lib/deck";
import { celebrate } from "@/lib/confetti";
import { useTx } from "@/hooks/useTx";

const ADDR = ADDRESSES.blackjack as `0x${string}`;
const abi = bjAbi;

// Blackjack total: aces are 11, demoted to 1 while busting.
function total(labels: string[]) {
  let t = 0;
  let aces = 0;
  for (const l of labels) {
    const r = l.slice(0, -1);
    if (r === "A") { t += 11; aces++; }
    else if (r === "J" || r === "Q" || r === "K") t += 10;
    else t += Number(r);
  }
  while (t > 21 && aces > 0) { t -= 10; aces--; }
  return t;
}
const isRed = (l: string) => l.endsWith("♦") || l.endsWith("♥");

// The dealer draws to 17 then stops; the rest of its pre-dealt buffer is unused.
function dealerPlayed(labels: string[]) {
  for (let k = 2; k <= labels.length; k++) {
    if (total(labels.slice(0, k)) >= 17) return labels.slice(0, k);
  }
  return labels;
}

// One hand row. Module-level so it never remounts (which would replay the flip).
function Hand({ who, cards, faceDown = 0, score }: { who: string; cards: string[]; faceDown?: number; score?: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
        {who}{score !== undefined && cards.length > 0 ? ` - ${score > 21 ? "bust" : score}` : ""}
      </span>
      <div className="flex flex-wrap justify-center gap-2">
        {cards.map((l, i) => <Card key={i} faceUp label={l} red={isRed(l)} />)}
        {Array.from({ length: faceDown }).map((_, i) => <Card key={`d${i}`} faceUp={false} />)}
        {cards.length === 0 && faceDown === 0 && (
          <div className="grid h-36 w-24 place-items-center border-2 border-dashed border-border text-xs text-muted-foreground">-</div>
        )}
      </div>
    </div>
  );
}

export default function BlackjackPage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [hand, setHand] = useState<string[]>([]);
  const [dealer, setDealer] = useState<string[]>([]); // full dealer hand once revealed
  const [upcard, setUpcard] = useState<string | null>(null);
  const [betEth, setBetEth] = useState("0.001");
  const [reading, setReading] = useState(false);
  const settling = useRef(false);
  const loadRun = useRef(0); // invalidates in-flight loads so stale reads can't overwrite

  const q = { enabled: !!ADDR, refetchInterval: 4000 };
  const { data: stateRaw, refetch: rState } = useReadContract({ address: ADDR, abi, functionName: "state", query: q });
  const { data: winRaw, refetch: rWin } = useReadContract({ address: ADDR, abi, functionName: "winnings", query: q });
  const { data: drawnRaw } = useReadContract({ address: ADDR, abi, functionName: "cardsDrawn", query: q });

  const handlesOf = async (fn: "playerHandHandles" | "dealerHandHandles") =>
    (await publicClient!.readContract({ address: ADDR, abi, functionName: fn })) as Hex[];

  // Read the public cards (no wallet signature). Player hand is always face-up;
  // the dealer shows its full hand only after stand, else just the upcard.
  async function loadHands() {
    const run = ++loadRun.current; // newest load wins; older ones bail out
    const live = () => loadRun.current === run;
    setReading(true);
    for (let i = 0; i < 8 && live(); i++) {
      try {
        const p = await readPublic(await handlesOf("playerHandHandles"));
        if (!live()) return;
        setHand(p.map((c) => decodeCard(c.value).label));
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
    if (!live()) return;
    try {
      const dh = await handlesOf("dealerHandHandles");
      try {
        const d = await readPublic(dh); // succeeds only once the dealer is revealed
        if (live()) setDealer(d.map((c) => decodeCard(c.value).label));
      } catch {
        const [u] = await readPublic([dh[0]]); // during play: just the upcard
        if (live()) setUpcard(decodeCard(u.value).label);
      }
    } catch {}
    if (live()) setReading(false);
  }

  const { send, busy, phase, hash } = useTx(() => { rState(); rWin(); void loadHands(); });
  const state = stateRaw !== undefined ? Number(stateRaw) : -1; // 0 Idle 1 PlayerTurn 2 Revealing 3 Done
  const winnings = (winRaw as bigint) ?? 0n;
  const pt = total(hand);
  const dealerShown = dealer.length ? dealerPlayed(dealer) : [];
  const dt = total(dealerShown);

  async function onSettle() {
    const p = toSettleArgs(await readPublic(await handlesOf("playerHandHandles")));
    const d = toSettleArgs(await readPublic(await handlesOf("dealerHandHandles")));
    send({ address: ADDR, abi, functionName: "settle", args: [p.values, p.sigs, d.values, d.sigs] });
  }

  // Reload visible cards on phase change AND whenever a card is drawn (a hit),
  // so a new card reliably appears. Refresh-safe; no signature.
  useEffect(() => {
    if (!ADDR || state < 1) return;
    void loadHands();
  }, [state, drawnRaw, publicClient]);

  // Stand -> Revealing: settle automatically (one less button).
  useEffect(() => {
    if (state !== 2 || settling.current) return;
    settling.current = true;
    void onSettle();
  }, [state]);

  // Celebrate a win once per hand; re-arm when a new hand starts.
  const celebrated = useRef(false);
  useEffect(() => {
    if (state === 3 && winnings > 0n && !celebrated.current) { celebrated.current = true; void celebrate(); }
    if (state === 1) celebrated.current = false;
  }, [state, winnings]);

  if (!ADDR) return <NoAddress env="NEXT_PUBLIC_BLACKJACK_ADDRESS" />;

  const playing = state === 1;
  const done = state === 3;

  return (
    <GameShell slug="blackjack">
      {state === 2 && <FullScreenLoader text="dealer playing" />}
      <div className="flex flex-col gap-5 py-2">
        <Hand who="dealer" cards={done ? dealerShown : upcard ? [upcard] : []} faceDown={playing && upcard ? 1 : 0} score={done ? dt : undefined} />
        <Hand who="you" cards={hand} score={pt} />
      </div>

      <TxBar text={busy ? phase : reading ? "reading cards" : settling.current && state === 2 ? "dealer playing" : stateRaw === undefined ? "loading table" : null} />

      <Step n={1} title={done ? "Deal a new hand" : "Bet and deal"}>
        <div className="flex gap-2">
          <input value={betEth} onChange={(e) => setBetEth(e.target.value)}
            className="w-24 border-2 border-border bg-transparent px-2 py-1 text-sm" />
          <Button disabled={busy || playing || state === 2 || (done && winnings > 0n)}
            onClick={() => {
              loadRun.current++; // cancel any in-flight read from the previous hand
              setHand([]); setDealer([]); setUpcard(null); setReading(false); settling.current = false;
              send({ address: ADDR, abi, functionName: "deal", args: [], value: parseEther(betEth || "0") });
            }}>
            {done ? "New hand" : "Deal"}
          </Button>
        </div>
        {done && winnings > 0n && <p className="text-xs text-muted-foreground">Claim your winnings below before the next hand.</p>}
      </Step>

      <Step n={2} title="Hit or stand">
        <div className="flex gap-3">
          <Button variant="outline" disabled={busy || !playing}
            onClick={() => send({ address: ADDR, abi, functionName: "hit", args: [] })}>
            Hit
          </Button>
          <Button disabled={busy || !playing}
            onClick={() => send({ address: ADDR, abi, functionName: "stand", args: [] })}>
            Stand
          </Button>
        </div>
        {playing && <p className="text-xs text-muted-foreground">Dealer draws to 17 after you stand.</p>}
      </Step>

      {done && (
        <div className="border-2 border-primary bg-card/60 p-6 text-center">
          <div className="text-lg uppercase tracking-wide text-primary">{winnings > 0n ? "You win" : "House wins"}</div>
          <div className="mt-1 text-xs text-muted-foreground">you {pt > 21 ? "bust" : pt} vs dealer {dt > 21 ? "bust" : dt}</div>
          {winnings > 0n && (
            <Button className="mt-3" disabled={busy}
              onClick={() => send({ address: ADDR, abi, functionName: "claim", args: [] })}>
              Claim {formatEther(winnings)} ETH
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
