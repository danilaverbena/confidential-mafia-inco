"use client";

import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useConnect, type Connector } from "wagmi";
import { isInsideTelegram, openCurrentPageInExternalBrowser } from "@/lib/telegram";

/** RainbowKit registers *two* WalletConnect connectors: its own (which renders
 * RainbowKit's in-page QR modal, `showQrModal: false`) and one that opens the
 * official WalletConnect/Reown modal (`showQrModal: true`, tagged
 * `rkDetails.isWalletConnectModalConnector`).
 *
 * That distinction is the whole fix for Telegram. RainbowKit's own modal is not
 * Telegram-aware: it opens wallet links with the default target, which
 * Telegram's embedded webview silently refuses, so the modal just closes and
 * nothing happens. The official Reown modal *is* Telegram-aware -- see
 * `@reown/appkit-controllers`' CoreHelperUtil: `isTelegram()` checks
 * `window.TelegramWebviewProxy` / `window.Telegram`, and
 * `getOpenTargetForPlatform()` forces `_blank` for it, which Telegram's webview
 * does hand off to the OS correctly.
 *
 * So inside Telegram we bypass RainbowKit's modal entirely and connect straight
 * to this connector. */
// Matched on the rkDetails flag alone, deliberately not also on `id`:
// scripts/wc-connector-check.mjs verifies this flag is set on exactly one
// registered connector, and the connector's `id` is resolved by wagmi at
// runtime and isn't reliably "walletConnect" at the point we inspect it.
function findWalletConnectModalConnector(connectors: readonly Connector[]) {
  return connectors.find(
    (c) =>
      (c as Connector & { rkDetails?: { isWalletConnectModalConnector?: boolean } }).rkDetails
        ?.isWalletConnectModalConnector === true
  );
}

// Terminal-styled connect button with an explicit wrong-network state, instead
// of RainbowKit's default widget. Uses ConnectButton.Custom render props.
export function ConnectWallet() {
  const { connect, connectors, isPending, error } = useConnect();
  // Telegram detection must happen after mount -- window.Telegram is injected by
  // the SDK script, so evaluating it during SSR/first render would always be
  // false and produce a hydration mismatch.
  const [inTelegram, setInTelegram] = useState(false);
  useEffect(() => setInTelegram(isInsideTelegram()), []);

  const onTelegramConnect = () => {
    const wc = findWalletConnectModalConnector(connectors);
    if (wc) {
      connect({ connector: wc });
    } else {
      // Shouldn't happen (Providers always registers walletConnectWallet), but
      // if it ever does, the external browser still works.
      openCurrentPageInExternalBrowser();
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <ConnectButton.Custom>
        {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
          const ready = mounted;
          const connected = ready && account && chain;
          return (
            <div
              className="text-xs uppercase tracking-wide"
              {...(!ready && { "aria-hidden": true, style: { opacity: 0, pointerEvents: "none", userSelect: "none" } })}
            >
              {!connected ? (
                <button
                  onClick={inTelegram ? onTelegramConnect : openConnectModal}
                  disabled={isPending}
                  className="border-2 border-primary px-3 py-2 text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
                >
                  {isPending ? "connecting..." : "connect wallet"}
                </button>
              ) : chain.unsupported ? (
                <button
                  onClick={openChainModal}
                  className="border-2 border-destructive px-3 py-2 text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
                >
                  wrong network
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={openChainModal}
                    className="border border-border px-2 py-1.5 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    {chain.name}
                  </button>
                  <button
                    onClick={openAccountModal}
                    className="border-2 border-primary px-2 py-1.5 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                  >
                    {account.displayName}
                  </button>
                </div>
              )}
            </div>
          );
        }}
      </ConnectButton.Custom>

      {/* Surface connect errors -- inside Telegram these were previously
          swallowed entirely, which is why it looked like "nothing happens". */}
      {error && (
        <p className="max-w-[14rem] text-right text-[10px] leading-tight text-destructive">
          {error.message}
        </p>
      )}

      {inTelegram && (
        <button
          onClick={openCurrentPageInExternalBrowser}
          className="text-[10px] uppercase tracking-wide text-muted-foreground underline underline-offset-2 hover:text-primary"
        >
          wallet not connecting? open in browser
        </button>
      )}
    </div>
  );
}
