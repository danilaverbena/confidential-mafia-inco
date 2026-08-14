"use client";

import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import {
  RainbowKitProvider,
  connectorsForWallets,
  darkTheme,
} from "@rainbow-me/rainbowkit";
import {
  walletConnectWallet,
  coinbaseWallet,
  metaMaskWallet,
  rainbowWallet,
  trustWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { ThemeProvider } from "next-themes";
import { activeChain } from "@/lib/network";
import { isInsideTelegram } from "@/lib/telegram";

const queryClient = new QueryClient();

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

// Telegram's own "Wallet" (the @wallet bot / Settings > Wallet) runs on TON,
// not EVM -- it cannot sign transactions for our Base Sepolia contract, so it
// can't be listed here as a literal connector. Inside Telegram's own Android
// webview, only WalletConnect actually works -- every other connector was
// live-tested and found to hard-fail there, for reasons that can't be
// configured away:
//   - metaMaskWallet: @metamask/sdk's mobile deep link (dist/browser/umd/
//     metamask-sdk.iife.js) does `window.location.href = "metamask://..."`
//     directly when `useDeeplink` is set, which the browser's `Location`
//     API doesn't expose a way to intercept/rewrite (unlike `window.open`,
//     which we *do* patch in TelegramInit.tsx for other cases). Telegram's
//     webview can't navigate to a non-http(s) scheme this way and fails with
//     `net::ERR_UNKNOWN_URL_SCHEME`.
//   - coinbaseWallet: @coinbase/wallet-sdk's `fetchSignerType`
//     (sign/util.js) unconditionally opens a keys.coinbase.com popup and
//     waits for a `postMessage` back through `window.opener`, for every
//     `preference` value ('all' / 'eoaOnly' / 'smartWalletOnly' all still
//     open the same popup -- preference only changes what's offered inside
//     it). Telegram's webview never preserves `window.opener` on popups, so
//     it always fails with "This app doesn't support smart wallets".
//   - rainbowWallet / trustWallet: same family of custom-scheme /
//     window.opener assumptions as the two above.
// WalletConnect (@walletconnect/ethereum-provider) is the one path that's
// actually Telegram-aware upstream: it detects `window.Telegram` /
// `window.TelegramWebviewProxy` itself and forces `_blank` navigation
// instead of `_self`/`location.href`, which Telegram's webview can hand off
// to the OS correctly -- and it's still how a user reaches MetaMask,
// Coinbase Wallet, Trust, Rainbow, etc. on mobile, just through WC's pairing
// URI instead of each wallet's broken native deep link.
//
// So: inside Telegram, show ONLY WalletConnect -- the per-wallet buttons are
// hidden rather than shown-and-broken. Outside Telegram (a normal desktop
// browser tab, e.g. testing locally), the full wallet list is shown, since
// browser extensions, popups and custom schemes all work normally there.
//
// Even WalletConnect itself can silently fail inside Telegram's embedded
// webview: its connect flow generates a pairing URI over an async relay
// round-trip *before* calling window.open with the resulting deep link, so
// by the time that call happens it can fall outside the "direct user
// gesture" window some webviews require to allow window.open/navigation at
// all -- Telegram's own webview appears to be one of them, closing the
// RainbowKit modal (as if it were about to hand off to a deep link) with no
// visible error. There's no reliable fix from inside the embedded webview
// for that -- see the "Open in browser" fallback wired into
// components/ConnectWallet.tsx, which reopens the page via
// Telegram.WebApp.openLink() in a real external browser tab (Chrome Custom
// Tab / Safari View Controller), where none of the above restrictions apply.
const connectors = projectId
  ? connectorsForWallets(
      isInsideTelegram()
        ? [
            {
              groupName: "Wallet",
              wallets: [walletConnectWallet],
            },
          ]
        : [
            {
              groupName: "Recommended",
              wallets: [walletConnectWallet],
            },
            {
              groupName: "More wallets",
              wallets: [coinbaseWallet, metaMaskWallet, rainbowWallet, trustWallet],
            },
          ],
      {
        appName: "Confidential Mafia",
        projectId,
      }
    )
  : [];

const config = projectId
  ? createConfig({
      chains: [activeChain],
      connectors,
      transports: {
        [activeChain.id]: http(),
      },
      ssr: true,
    })
  : createConfig({
      chains: [activeChain],
      transports: {
        [activeChain.id]: http(),
      },
      ssr: true,
    });

// RainbowKit always renders dark to match the terminal palette (navy + blue).
const rainbowTheme = darkTheme({
  accentColor: "#3673F5",
  accentColorForeground: "#ffffff",
  borderRadius: "none",
  overlayBlur: "small",
});

const Providers = ({ children }: { children: ReactNode }) => {
  if (!projectId) {
    console.warn(
      "Missing NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID. Get one at https://cloud.walletconnect.com/"
    );
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} forcedTheme="dark">
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider theme={rainbowTheme}>{children}</RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
};

export { Providers };
