import hre from "hardhat";
import { parseEther } from "viem";

// Fund a contract (e.g. the Blackjack house bankroll or a Mafia shuffle fee).
// TARGET=0x.. AMOUNT_ETH=0.01 hardhat run scripts/fund.ts --network baseSepolia
async function main() {
  const target = process.env.TARGET as `0x${string}`;
  const amount = process.env.AMOUNT_ETH || "0.01";
  if (!target) throw new Error("set TARGET=0x...");

  const [wallet] = await hre.viem.getWalletClients();
  const pub = await hre.viem.getPublicClient();
  console.log(`funding ${target} with ${amount} ETH from ${wallet.account.address}`);

  const hash = await wallet.sendTransaction({ to: target, value: parseEther(amount) });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log(`status: ${receipt.status}\ntx: ${hash}`);
  // The balance may take a moment to propagate; check the explorer if it lags.
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
