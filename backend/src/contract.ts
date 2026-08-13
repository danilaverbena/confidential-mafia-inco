import { createPublicClient, http, getContract, type Abi } from "viem";
import { baseSepolia } from "viem/chains";
import confidentialMafiaArtifact from "../abi/ConfidentialMafia.json" with { type: "json" };

// Hardhat artifacts wrap the ABI in a { abi, bytecode, ... } envelope --
// only .abi is the actual ABI array viem needs.
export const confidentialMafiaAbi = confidentialMafiaArtifact.abi as Abi;

export function buildContractWatcher(rpcUrl: string, address: `0x${string}`) {
  const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const contract = getContract({ address, abi: confidentialMafiaAbi, client });

  return { client, contract };
}
