"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { isInsideTelegram, openCurrentPageInExternalBrowser } from "@/lib/telegram";

// Terminal-styled connect button with an explicit wrong-network state, instead
// of RainbowKit's default widget. Uses ConnectButton.Custom render props.
//
// Every wallet-connect path we tried inside Telegram's own embedded Mini App
// webview turned out to be broken in a way that can't be configured around
// (see the long comment in Providers.tsx): per-wallet deep links use a
// custom URL scheme the webview can't navigate to, Coinbase's connector
// needs a popup with `window.opener` the webview doesn't preserve, and even
// WalletConnect's own deep link can get built too late to still count as a
// "direct user gesture", which the webview silently drops. So alongside the
// normal connect button, we show an explicit "Open in browser" escape hatch
// when running inside Telegram -- it reopens this same page in a real
// external browser tab via Telegram.WebApp.openLink(), where none of those
// restrictions apply and every wallet (including the per-wallet buttons
// hidden here) works normally.
export function ConnectWallet() {
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
                  onClick={openConnectModal}
                  className="border-2 border-primary px-3 py-2 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  connect wallet
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

      {isInsideTelegram() && (
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
