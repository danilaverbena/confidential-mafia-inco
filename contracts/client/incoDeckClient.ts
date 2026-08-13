// Frontend helpers for any ConfidentialDeck contract.
import { Lightning } from "@inco/lightning-js/lite";
import type { HexString } from "@inco/lightning-js";
import { bytesToHex, type WalletClient } from "viem";

// A decrypted card plus its on-chain proof.
export interface RevealedCard {
  handle: HexString;
  value: bigint; // raw deck value, 1..n
  sigs: HexString[]; // covalidator sigs for the contract
}

// Init the SDK: local Inco node or Base Sepolia.
export async function getZap(opts?: { local?: boolean }) {
  return opts?.local ? Lightning.localNode("mainnet") : Lightning.baseSepoliaTestnet();
}

function toRevealed(r: any): RevealedCard {
  return {
    handle: r.handle as HexString,
    value: BigInt(r.plaintext.value),
    sigs: r.covalidatorSignatures.map((s: Uint8Array) => bytesToHex(s)) as HexString[],
  };
}

// Covalidator is async; retry until the value lands.
async function withRetry<T>(fn: () => Promise<T>, tries = 12, delayMs = 3000): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === tries - 1) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

// Decrypt your privately dealt cards. Owner only, TEE refuses others.
export async function peekMyCards(
  zap: any,
  walletClient: WalletClient,
  handles: HexString[],
): Promise<RevealedCard[]> {
  const results = await withRetry<any[]>(() => zap.attestedDecrypt(walletClient, handles));
  return results.map(toRevealed);
}

// Decrypt public cards. No wallet, anyone can read.
export async function readRevealed(zap: any, handles: HexString[]): Promise<RevealedCard[]> {
  const results = await withRetry<any[]>(() => zap.attestedReveal(handles));
  return results.map(toRevealed);
}

// Shape revealed cards into (values, sigs) for settle.
export function packForSettle(cards: RevealedCard[]): { values: bigint[]; sigs: HexString[][] } {
  return { values: cards.map((c) => c.value), sigs: cards.map((c) => c.sigs) };
}

// Optional: 52-card decoding (mirrors CardLib.sol).

const RANKS = "23456789TJQKA";
const SUITS = ["♣", "♦", "♥", "♠"];

export interface Card {
  value: number; // raw 1..52
  rank: number; // 0..12 (0 = Two, 12 = Ace)
  suit: number; // 0..3
  label: string; // e.g. "A♠"
}

// Decode a 1..52 value into rank/suit/label.
export function decodeCard(value: number | bigint): Card {
  const v = Number(value);
  if (v < 1 || v > 52) throw new Error(`card value out of range: ${v}`);
  const id = v - 1;
  const rank = id % 13;
  const suit = Math.floor(id / 13);
  return { value: v, rank, suit, label: `${RANKS[rank]}${SUITS[suit]}` };
}
