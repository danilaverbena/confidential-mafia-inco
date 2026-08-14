// Registry for the home grid + deployed addresses (from .env.local).
export interface GameMeta {
  slug: string;
  name: string;
  tagline: string;
  secret: string; // what the deck keeps hidden
  wallets: string; // how many wallets you need to play
  emoji: string;
}

export const GAMES: GameMeta[] = [
  { slug: "war", name: "War", tagline: "One card each, higher wins.", secret: "each hole card until showdown", wallets: "2 wallets", emoji: "🂡" },
  { slug: "blackjack", name: "Blackjack", tagline: "Hit to 21, beat the dealer.", secret: "the dealer's hole card + shoe", wallets: "1 wallet", emoji: "🃏" },
  { slug: "raffle", name: "Raffle", tagline: "One shuffle picks a hidden winner.", secret: "the winning ticket until the draw", wallets: "1 wallet", emoji: "🎟️" },
  { slug: "mafia", name: "Mafia (roles only)", tagline: "Each player gets a secret role. Upstream demo, kept for reference.", secret: "every role, seen only by its owner", wallets: "2+ wallets", emoji: "🕵️" },
  { slug: "confidential-mafia", name: "Confidential Mafia", tagline: "Hidden roles AND hidden night actions -- a full social-deduction round.", secret: "roles, and who the mafia/doctor targeted", wallets: "3+ wallets", emoji: "🌟" },
];

// Base Sepolia explorer links (used to show a tx after a result).
export const EXPLORER = "https://sepolia.basescan.org";
export const txUrl = (hash?: string) => (hash ? `${EXPLORER}/tx/${hash}` : undefined);
export const addrUrl = (addr?: string) => (addr ? `${EXPLORER}/address/${addr}` : undefined);
export const short = (a?: string) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "");

// NEXT_PUBLIC_* must be referenced statically so Next can inline them.
export const ADDRESSES: Record<string, `0x${string}` | undefined> = {
  war: process.env.NEXT_PUBLIC_WAR_ADDRESS as `0x${string}` | undefined,
  blackjack: process.env.NEXT_PUBLIC_BLACKJACK_ADDRESS as `0x${string}` | undefined,
  raffle: process.env.NEXT_PUBLIC_RAFFLE_ADDRESS as `0x${string}` | undefined,
  mafia: process.env.NEXT_PUBLIC_MAFIA_ADDRESS as `0x${string}` | undefined,
  "confidential-mafia": process.env.NEXT_PUBLIC_CONFIDENTIAL_MAFIA_ADDRESS as `0x${string}` | undefined,
};
