import "dotenv/config";
import { Lightning } from "@inco/lightning-js/lite";
import { createWalletClient, http, bytesToHex } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, getContract } from "viem";
import artifact from "../artifacts/contracts/examples/ConfidentialMafia.sol/ConfidentialMafia.json" with { type: "json" };

const RPC = process.env.BASE_SEPOLIA_RPC_URL!;
const CONTRACT = process.env.CONFIDENTIAL_MAFIA_ADDRESS as `0x${string}`;
const DEPLOYER_KEY = process.env.PRIVATE_KEY_BASE_SEPOLIA as `0x${string}`;

const victimIndexHandle = process.argv[2] as `0x${string}`;
const deathFlagHandle = process.argv[3] as `0x${string}`;

async function withRetry<T>(fn: () => Promise<T>, tries = 15, delayMs = 4000): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      console.log(`  retry ${i + 1}/${tries}: ${(err as Error).message?.slice(0, 100)}`);
      if (i === tries - 1) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function main() {
  const zap = await Lightning.baseSepoliaTestnet();
  const account = privateKeyToAccount(DEPLOYER_KEY);
  const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(RPC) });
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
  const contract = getContract({ address: CONTRACT, abi: artifact.abi, client: { public: publicClient, wallet } });

  console.log("Fetching attested reveal for:", { victimIndexHandle, deathFlagHandle });
  const results = await withRetry(() => zap.attestedReveal([victimIndexHandle, deathFlagHandle]));

  const toRevealed = (r: any) => ({
    value: BigInt(r.plaintext.value),
    sigs: r.covalidatorSignatures.map((s: Uint8Array) => bytesToHex(s)),
  });

  const [victim, dies] = results.map(toRevealed);
  console.log("victimIndex =", victim.value.toString(), "dies =", dies.value.toString());

  console.log("Calling settleNight...");
  const hash = await contract.write.settleNight([victim.value, victim.sigs, dies.value, dies.sigs], { gas: 2_000_000n });
  console.log("settleNight tx:", hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("settleNight status:", receipt.status);
  if (receipt.status !== "success") {
    console.error("settleNight reverted, stopping.");
    process.exit(1);
  }

  if (dies.value === 1n) {
    console.log("A player died -- fetching their role handle for the follow-up reveal...");
    const players = [] as string[];
    let i = 0n;
    // small game (3 players), just read players(i) until it reverts
    for (i = 0n; i < 3n; i++) {
      players.push((await contract.read.players([i])) as string);
    }
    const victimAddress = players[Number(victim.value)];
    console.log("victim address:", victimAddress);
    const roleHandle = (await contract.read.roleHandleOf([victimAddress])) as `0x${string}`;
    console.log("role handle:", roleHandle);

    const [role] = (await withRetry(() => zap.attestedReveal([roleHandle]))).map(toRevealed);
    console.log("role value:", role.value.toString());

    const hash2 = await contract.write.settleNightRole([role.value, role.sigs], { gas: 2_000_000n });
    console.log("settleNightRole tx:", hash2);
    const receipt2 = await publicClient.waitForTransactionReceipt({ hash: hash2 });
    console.log("settleNightRole status:", receipt2.status);
  } else {
    console.log("Nobody died this round (doctor saved the target, or no mafia vote landed).");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
