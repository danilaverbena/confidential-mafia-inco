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

const queryClient = new QueryClient();

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

// Telegram's own "Wallet" (the @wallet bot / Settings > Wallet) runs on TON,
// not EVM -- it cannot sign transactions for our Base Sepolia contract, so it
// can't be listed here as a literal connector. What we *can* do to feel native
// inside the Telegram Mini App webview is put the connectors that work well
// without a browser extension first:
//   - WalletConnect: deep-links out to the user's mobile wallet app (MetaMask,
//     Trust, Rainbow, etc.) and back into Telegram -- the standard way to
//     connect a real wallet from inside any in-app browser, Telegram included.
//   - Coinbase Wallet: supports its passkey-based Smart Wallet, which needs no
//     extension and no separate app, so it "just works" inside the Telegram
//     webview.
// Extension-only connectors (plain injected MetaMask, Rainbow, Trust as browser
// extensions) are kept as a secondary group since they only function when the
// Mini App happens to be opened in a desktop browser tab instead of Telegram's
// own webview.
const connectors = projectId
  ? connectorsForWallets(
      [
        {
          groupName: "Recommended in Telegram",
          wallets: [walletConnectWallet, coinbaseWallet],
        },
        {
          groupName: "More wallets",
          wallets: [metaMaskWallet, rainbowWallet, trustWallet],
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
