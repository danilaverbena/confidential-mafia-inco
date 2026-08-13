// Blackjack tests: pure math (no Docker) + full Inco hand (local node).
import { expect } from "chai";
import hre from "hardhat";
import { Lightning } from "@inco/lightning-js/lite";
import type { HexString } from "@inco/lightning-js";
import { bytesToHex, parseEther, type PublicClient } from "viem";

type WalletClient = Awaited<ReturnType<typeof hre.viem.getWalletClients>>[number];

// card id = suit*13 + rank; rank 0='2' .. 12='A'
const card = (rank: number, suit = 0) => suit * 13 + rank;
const A = 12, K = 11, T = 8, NINE = 7, SIX = 4, SEVEN = 5;

describe("BlackjackMath (pure)", function () {
  let h: any;
  const best = (ids: number[]) => h.read.bestTotal([ids]);
  const dealer = (ids: number[]) => h.read.dealerTotal([ids]);

  before(async function () {
    h = await hre.viem.deployContract("BlackjackMathHarness", []);
  });

  it("scores a natural blackjack as 21", async function () {
    expect(await best([card(A), card(K)])).to.equal(21n);
  });

  it("demotes aces to avoid busting", async function () {
    // A+A+9 -> demote one ace -> 21
    expect(await best([card(A, 0), card(A, 1), card(NINE)])).to.equal(21n);
    // A+6+K -> demote the ace -> 17
    expect(await best([card(A), card(SIX), card(K)])).to.equal(17n);
  });

  it("busts a hard hand over 21", async function () {
    // K+Q+5 = 25
    expect(await best([card(K), card(10), card(3)])).to.equal(25n);
  });

  it("dealer hits below 17 and stands at 17+", async function () {
    // stands on 17
    expect(await dealer([card(K), card(SEVEN)])).to.equal(17n);
    // 12 -> hit -> 18, stands
    expect(await dealer([card(SIX, 0), card(SIX, 1), card(SIX, 2)])).to.equal(18n);
    // soft 17 stands (simplified rule)
    expect(await dealer([card(A), card(SIX)])).to.equal(17n);
  });
});

describe("Blackjack (Inco covalidator)", function () {
  let zap: any;
  let pub: PublicClient;
  let house: WalletClient;
  let player: WalletClient;

  before(async function () {
    if (hre.network.name === "hardhat") this.skip(); // needs the Inco local node
    const chainId = hre.network.config.chainId;
    zap = chainId === 31337 ? await Lightning.localNode("mainnet") : await Lightning.baseSepoliaTestnet();
    pub = await hre.viem.getPublicClient();
    [house, player] = await hre.viem.getWalletClients();
  });

  async function tx(p: Promise<`0x${string}`>) {
    const rcpt = await pub.waitForTransactionReceipt({ hash: await p });
    expect(rcpt.status, "tx reverted").to.equal("success");
  }

  async function withRetry<T>(fn: () => Promise<T>, tries = 15): Promise<T> {
    for (let i = 0; ; i++) {
      try {
        return await fn();
      } catch (e) {
        if (i === tries - 1) throw e;
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
  }
  const pack = (rs: any[]) => ({
    values: rs.map((r) => BigInt(r.plaintext.value)),
    sigs: rs.map((r) => r.covalidatorSignatures.map((s: Uint8Array) => bytesToHex(s)) as HexString[]),
  });

  it("plays a full hand: private deal, public upcard, hit, stand, attested settle", async function () {
    const bet = parseEther("0.05");
    const game = await hre.viem.deployContract("Blackjack", []);
    const at = (w: WalletClient) =>
      hre.viem.getContractAt("Blackjack", game.address, { client: { wallet: w } });

    // Fund house bankroll: payout + shuffle fee.
    await tx(house.sendTransaction({ to: game.address, value: parseEther("1"), account: house.account, chain: null }));

    // Player bets and is dealt in.
    await tx((await at(player)).write.deal({ value: bet, account: player.account }));

    // Player cards are face-up (public) - readable with no signature.
    const holeHandles = (await game.read.playerHandHandles()) as readonly HexString[];
    const hole = await withRetry<any[]>(() => zap.attestedReveal([...holeHandles]));
    const RANKS = "23456789TJQKA";
    console.log(
      "      player hole:",
      hole.map((r: any) => RANKS[(Number(r.plaintext.value) - 1) % 13]).join(" "),
    );
    expect(hole.length).to.equal(2);

    // Dealer upcard is public; its hole card stays hidden until stand.
    const dealerHandles = (await game.read.dealerHandHandles()) as readonly HexString[];
    const [up] = await withRetry<any[]>(() => zap.attestedReveal([dealerHandles[0]]));
    expect(Number(up.plaintext.value)).to.be.within(1, 52);
    let hidden = false;
    try {
      await zap.attestedReveal([dealerHandles[1]]); // hole card not revealed yet
    } catch {
      hidden = true;
    }
    expect(hidden, "dealer hole card must stay hidden until stand").to.equal(true);

    // Hit once, then stand.
    await tx((await at(player)).write.hit({ account: player.account }));
    await tx((await at(player)).write.stand({ account: player.account }));

    // All public now: read and settle.
    const pHandles = (await game.read.playerHandHandles()) as readonly HexString[];
    const dHandles = (await game.read.dealerHandHandles()) as readonly HexString[];
    const p = pack(await withRetry<any[]>(() => zap.attestedReveal([...pHandles])));
    const d = pack(await withRetry<any[]>(() => zap.attestedReveal([...dHandles])));

    await tx(
      (await at(house)).write.settle([p.values, p.sigs, d.values, d.sigs], { account: house.account }),
    );
    expect(Number(await game.read.state())).to.equal(3); // State.Done

    const won = (await game.read.winnings()) as bigint;
    expect([0n, bet, bet * 2n]).to.include(won); // loss / push / win
    if (won > 0n) {
      await tx((await at(player)).write.claim({ account: player.account }));
      expect((await game.read.winnings()) as bigint).to.equal(0n);
    }
    console.log(`      outcome payout: ${won}`);

    // Replay: a fresh hand deals again once the last is done + claimed.
    await tx((await at(player)).write.deal({ value: bet, account: player.account }));
    expect(Number(await game.read.state())).to.equal(1); // PlayerTurn again
  });
});
