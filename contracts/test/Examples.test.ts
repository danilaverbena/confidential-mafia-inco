// War, Raffle, Mafia examples. Need the Inco local node (TEE shuffle).
import { expect } from "chai";
import hre from "hardhat";
import { Lightning } from "@inco/lightning-js/lite";
import type { HexString } from "@inco/lightning-js";
import { type Address, type PublicClient, bytesToHex, parseEther } from "viem";

type WalletClient = Awaited<ReturnType<typeof hre.viem.getWalletClients>>[number];

describe("ConfidentialDeck examples (Inco covalidator)", function () {
  let zap: any;
  let pub: PublicClient;
  let wallets: WalletClient[];

  before(async function () {
    if (hre.network.name === "hardhat") this.skip();
    const chainId = hre.network.config.chainId;
    zap = chainId === 31337 ? await Lightning.localNode("mainnet") : await Lightning.baseSepoliaTestnet();
    pub = await hre.viem.getPublicClient();
    wallets = await hre.viem.getWalletClients();
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
  const sigOf = (r: any) =>
    r.covalidatorSignatures.map((s: Uint8Array) => bytesToHex(s)) as HexString[];
  const at = (name: string, addr: Address, w: WalletClient) =>
    hre.viem.getContractAt(name, addr, { client: { wallet: w } });

  // War
  it("War: matchmaking, private cards, reveal, winner claims, new table opens", async function () {
    const bet = parseEther("0.05");
    const [a, b, c] = wallets;
    const war = await hre.viem.deployContract("War", [bet]);
    const room = 0n; // first join opens table 0; second reuses it

    await tx((await at("War", war.address, a)).write.join([], { value: bet, account: a.account }));
    await tx((await at("War", war.address, b)).write.join([], { value: bet, account: b.account }));

    // Each peeks their own card; the opponent cannot.
    const h0 = (await war.read.cardHandle([room, 0])) as HexString;
    const h1 = (await war.read.cardHandle([room, 1])) as HexString;
    await withRetry(() => zap.attestedDecrypt(a, [h0]));
    await withRetry(() => zap.attestedDecrypt(b, [h1]));
    let denied = false;
    try {
      await zap.attestedDecrypt(b, [h0]);
    } catch {
      denied = true;
    }
    expect(denied, "opponent must not read your card").to.equal(true);

    // Open both cards, then read + settle.
    await tx((await at("War", war.address, a)).write.showdown([room], { account: a.account }));
    const [r0, r1] = await withRetry<any[]>(() => zap.attestedReveal([h0, h1]));
    await tx(
      (await at("War", war.address, a)).write.settle(
        [room, [BigInt(r0.plaintext.value), BigInt(r1.plaintext.value)], [sigOf(r0), sigOf(r1)]],
        { account: a.account },
      ),
    );

    const info = (await war.read.roomOf([room])) as unknown as any[];
    expect(Number(info[4])).to.equal(3); // state Done
    const p0 = (await war.read.payout([a.account.address])) as bigint;
    const p1 = (await war.read.payout([b.account.address])) as bigint;
    // Payouts equal the real balance (pot minus the shuffle fee), so claim stays solvent.
    expect(p0 + p1).to.equal(await pub.getBalance({ address: war.address }));
    // The winner must actually be able to claim - the part the old test skipped.
    const winner = p0 >= p1 ? a : b;
    await tx((await at("War", war.address, winner)).write.claim([], { account: winner.account }));
    expect((await war.read.payout([winner.account.address])) as bigint).to.equal(0n);

    // Matchmaking: a newcomer joining while table 0 is busy opens table 1.
    await tx((await at("War", war.address, c)).write.join([], { value: bet, account: c.account }));
    expect(await war.read.roomCount()).to.equal(2n);
    expect(Number((await war.read.roomOfPlayer([c.account.address])) as bigint)).to.equal(1);
  });

  // Raffle
  it("Raffle: hidden winner from one shuffle, revealed at the draw", async function () {
    const price = parseEther("0.02");
    const [, ...rest] = wallets;
    const players = rest.slice(0, 4);
    const raffle = await hre.viem.deployContract("Raffle", [price, 3]);

    for (const w of players) {
      await tx((await at("Raffle", raffle.address, w)).write.enter([], { value: price, account: w.account }));
    }
    const n = Number(await raffle.read.entrantCount());
    expect(n).to.equal(4);

    const fee = (await raffle.read.deckFee([n])) as bigint;
    await tx((await at("Raffle", raffle.address, players[0])).write.draw([], { value: fee, account: players[0].account }));

    // Winning ticket was unknowable until now; reveal + settle.
    const wh = (await raffle.read.winningTicketHandle()) as HexString;
    const [rr] = await withRetry<any[]>(() => zap.attestedReveal([wh]));
    const ticket = BigInt(rr.plaintext.value);
    expect(Number(ticket)).to.be.within(1, n);

    const before = await Promise.all(
      players.map((w) => pub.getBalance({ address: w.account.address })),
    );
    await tx((await at("Raffle", raffle.address, players[0])).write.settle([ticket, sigOf(rr)], { account: players[0].account }));

    const winner = ((await raffle.read.winner()) as string).toLowerCase();
    expect(players.map((w) => w.account.address.toLowerCase())).to.include(winner);
    const idx = players.findIndex((w) => w.account.address.toLowerCase() === winner);
    const after = await pub.getBalance({ address: players[idx].account.address });
    // Winner is up, net of their own gas.
    expect(after > before[idx]).to.equal(true);
    console.log(`      raffle winner: ticket ${ticket} -> ${winner}`);

    // Replay: reopen ticket sales for a fresh draw.
    await tx((await at("Raffle", raffle.address, players[0])).write.newRound([], { account: players[0].account }));
    expect(Number(await raffle.read.state())).to.equal(0); // Selling
    expect(await raffle.read.entrantCount()).to.equal(0n);
  });

  // Mafia
  it("Mafia: each player privately learns only their own role", async function () {
    const [, p1, p2, p3] = wallets;
    const roster = [p1, p2, p3];
    const mafia = await hre.viem.deployContract("Mafia", [1]); // 1 mafioso

    for (const w of roster) {
      await tx((await at("Mafia", mafia.address, w)).write.join([], { account: w.account }));
    }
    // Pre-fund the contract to sponsor the shuffle fee.
    const fee = (await mafia.read.deckFee([roster.length])) as bigint;
    await tx(p1.sendTransaction({ to: mafia.address, value: fee, account: p1.account, chain: null }));
    await tx((await at("Mafia", mafia.address, p1)).write.assignRoles([], { account: p1.account }));

    // Read own role token; value <= mafiaCount() means Mafia.
    let mafiaSeen = 0;
    for (const w of roster) {
      const h = (await mafia.read.roleHandleOf([w.account.address])) as HexString;
      const [role] = await withRetry<any[]>(() => zap.attestedDecrypt(w, [h]));
      const v = Number(role.plaintext.value);
      expect(v).to.be.within(1, roster.length);
      if (v <= 1) mafiaSeen += 1;
    }
    expect(mafiaSeen, "exactly one mafioso").to.equal(1);

    // A player must not read another's role.
    const other = (await mafia.read.roleHandleOf([p2.account.address])) as HexString;
    let denied = false;
    try {
      await zap.attestedDecrypt(p1, [other]);
    } catch {
      denied = true;
    }
    expect(denied, "roles are private to their owner").to.equal(true);

    // Replay: reset reopens joining for a fresh game.
    await tx((await at("Mafia", mafia.address, p1)).write.reset([], { account: p1.account }));
    expect(Number(await mafia.read.state())).to.equal(0); // Joining
    expect(await mafia.read.playerCount()).to.equal(0n);
  });
});
