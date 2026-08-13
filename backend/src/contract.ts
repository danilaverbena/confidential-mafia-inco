import { createPublicClient, http, getContract, type Abi } from "viem";
import { baseSepolia } from "viem/chains";
import confidentialMafiaAbi from "../abi/ConfidentialMafia.json" with { type: "json" };

export function buildContractWatcher(rpcUrl: string, address: `0x${string}`) {
  const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const contract = getContract({ address, abi: confidentialMafiaAbi as Abi, client });

  return { client, contract };
}
