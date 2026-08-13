"use client";

// Frontend half of ConfidentialDeck: peek, reveal, decode.
import { getIncoLightning } from "@/lib/network";
import { bytesToHex, type Hex, type WalletClient } from "viem";

let zapInstance: any = null;

// Cached Inco client for the active network.
export async function getZap() {
  if (!zapInstance) zapInstance = await getIncoLightning();
  return zapInstance;
}

export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export const SUITS = ["♣", "♦", "♥", "♠"]; // clubs diamonds hearts spades

export interface Card {
  value: number;
  rank: number;
  suit: number;
  label: string;
  red: boolean;
}

// Decode a 1..52 deck value into a card.
export function decodeCard(value: number | bigint): Card {
  const v = Number(value);
  const id = v - 1;
  const rank = id % 13;
  const suit = Math.floor(id / 13);
  return { value: v, rank, suit, label: `${RANKS[rank]}${SUITS[suit]}`, red: suit === 1 || suit === 2 };
}

export interface Revealed {
  value: bigint;
  sigs: Hex[];
}

function pack(r: any): Revealed {
  return { value: BigInt(r.plaintext.value), sigs: r.covalidatorSignatures.map((s: Uint8Array) => bytesToHex(s)) };
}

// Decrypt cards dealt to you (only the owner can; wallet signs).
export async function peek(walletClient: WalletClient, handles: Hex[]): Promise<Revealed[]> {
  const zap = await getZap();
  const res = await zap.attestedDecrypt(walletClient, handles);
  return res.map(pack);
}

// Read publicly revealed cards (no wallet needed).
export async function readPublic(handles: Hex[]): Promise<Revealed[]> {
  const zap = await getZap();
  const res = await zap.attestedReveal(handles);
  return res.map(pack);
}

// Split revealed cards into the (values, sigs) a settle() expects.
export function toSettleArgs(cards: Revealed[]) {
  return { values: cards.map((c) => c.value), sigs: cards.map((c) => c.sigs) };
}
