import { base, baseSepolia } from "wagmi/chains";
import type { Chain } from "viem";
import { Lightning } from "@inco/lightning-js/lite";

/**
 * Single source of truth for the active Base network.
 *
 * Switch networks by setting NEXT_PUBLIC_NETWORK in your .env:
 *   - "testnet" (default) → Base Sepolia
 *   - "mainnet"           → Base Mainnet
 */
export const NETWORK: "mainnet" | "testnet" =
  process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet";

// Typed as `Chain` (not the `base | baseSepolia` union) so `activeChain.id` is a plain `number`.
// A union would make wagmi require transports for BOTH chain ids (Record<8453 | 84532, …>);
// widening to `Chain` keeps `transports: { [activeChain.id]: http() }` a valid index-signature record.
export const activeChain: Chain = NETWORK === "mainnet" ? base : baseSepolia;

/**
 * Returns the Inco Lightning instance for the active network.
 * @inco/lightning-js exposes factories for both Base Sepolia and Base Mainnet.
 */
type LightningClient = Awaited<ReturnType<typeof Lightning.baseSepoliaTestnet>>;

export async function getIncoLightning(): Promise<LightningClient> {
  return NETWORK === "mainnet"
    ? Lightning.baseMainnet()
    : Lightning.baseSepoliaTestnet();
}
