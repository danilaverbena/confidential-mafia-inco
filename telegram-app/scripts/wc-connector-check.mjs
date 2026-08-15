// Verifies, without a browser, the assumption the Telegram fix rests on:
// that RainbowKit's connectorsForWallets() really does register a *second*
// WalletConnect connector flagged `rkDetails.isWalletConnectModalConnector`
// (the one that opens the official, Telegram-aware Reown modal), and that our
// selector in components/ConnectWallet.tsx picks exactly that one.
//
// Run from telegram-app/:  node scripts/wc-connector-check.mjs <projectId>

import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";

const projectId = process.argv[2] || "21fef48091f12692cad574a6f7753643";

const factories = connectorsForWallets(
  [{ groupName: "Wallet", wallets: [walletConnectWallet] }],
  { appName: "Confidential Mafia", projectId }
);

console.log(`connectorsForWallets([walletConnectWallet]) -> ${factories.length} connector factory/ies`);

// Each entry is a wagmi createConnector factory; invoke with a minimal config
// stub to read the resulting connector's metadata.
const stub = {
  chains: [{ id: 84532, name: "Base Sepolia" }],
  emitter: { emit() {}, on() {}, off() {}, once() {} },
  storage: null,
};

let found = 0;
factories.forEach((f, i) => {
  let c;
  try {
    c = f(stub);
  } catch (e) {
    console.log(`  [${i}] could not instantiate: ${e.message.slice(0, 80)}`);
    return;
  }
  const rk = c.rkDetails || {};
  const isModal = rk.isWalletConnectModalConnector === true;
  if (isModal) found++;
  console.log(
    `  [${i}] id=${c.id} name=${c.name}` +
      ` showQrModal=${rk.showQrModal}` +
      ` isWalletConnectModalConnector=${rk.isWalletConnectModalConnector}` +
      (isModal ? "   <-- selected by ConnectWallet.tsx inside Telegram" : "")
  );
});

console.log(
  found === 1
    ? "\nOK: exactly one official-modal WalletConnect connector -- selector is unambiguous."
    : `\nPROBLEM: expected exactly 1 official-modal connector, found ${found}.`
);
process.exit(found === 1 ? 0 : 1);
