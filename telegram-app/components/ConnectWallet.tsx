"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

// Terminal-styled connect button with an explicit wrong-network state, instead
// of RainbowKit's default widget. Uses ConnectButton.Custom render props.
export function ConnectWallet() {
  return (
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
  );
}
