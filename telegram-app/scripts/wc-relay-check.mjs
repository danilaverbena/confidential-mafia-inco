// Does a given WalletConnect project id actually authorize on the relay and
// produce a pairing URI? This is the thing that has to work before any wallet
// can be connected at all -- if it fails, the connect modal opens and then
// silently does nothing, which is exactly the symptom we were chasing.
//
// Usage: node wc-relay-check.mjs <projectId>

import { EthereumProvider } from "@walletconnect/ethereum-provider";

const projectId = process.argv[2];
if (!projectId) {
  console.error("usage: node wc-relay-check.mjs <projectId>");
  process.exit(2);
}

const timeout = (ms) =>
  new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out after ${ms}ms`)), ms));

try {
  console.log(`init EthereumProvider with projectId=${projectId} ...`);
  const provider = await Promise.race([
    EthereumProvider.init({
      projectId,
      chains: [84532], // Base Sepolia
      showQrModal: false,
      metadata: {
        name: "Confidential Mafia",
        description: "relay auth check",
        url: "https://confidential-mafia-inco.vercel.app",
        icons: [],
      },
    }),
    timeout(30000),
  ]);
  console.log("init OK -- relay accepted the project id");

  const uri = await Promise.race([
    new Promise((resolve) => provider.once("display_uri", resolve)),
    provider.connect().then(() => null).catch(() => null),
    timeout(30000),
  ]);

  if (typeof uri === "string" && uri.startsWith("wc:")) {
    console.log("PAIRING URI PRODUCED:", uri.slice(0, 80) + "...");
    console.log("\nRESULT: projectId works -- wallets can connect.");
    process.exit(0);
  }
  console.log("\nRESULT: init succeeded but no pairing URI was produced.");
  process.exit(1);
} catch (e) {
  console.log("\nRESULT: FAILED -", e.message);
  process.exit(1);
}
