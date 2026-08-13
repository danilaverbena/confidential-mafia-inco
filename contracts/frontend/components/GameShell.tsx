"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useAccount } from "wagmi";
import { GAMES } from "@/lib/games";
import { SNIPPETS } from "@/lib/snippets";
import { Panel } from "@/components/ui";
import { ConnectWallet } from "@/components/ConnectWallet";
import { CodePeek } from "@/components/CodePeek";

// Header + connect + privacy note wrapper shared by every game page.
export function GameShell({ slug, children }: { slug: string; children: React.ReactNode }) {
  const meta = GAMES.find((g) => g.slug === slug)!;
  const { isConnected } = useAccount();

  return (
    <motion.main
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-10"
    >
      <Link href="/" className="text-xs uppercase tracking-widest text-muted-foreground hover:text-primary">
        &larr; games
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl uppercase tracking-wide text-primary">{meta.name}</h1>
          <p className="text-sm text-muted-foreground">{meta.tagline}</p>
        </div>
        <ConnectWallet />
      </div>

      <p className="border-l-2 border-primary pl-3 text-xs text-muted-foreground">
        <span className="text-primary">secret:</span> {meta.secret}
      </p>

      {SNIPPETS[slug] && <CodePeek code={SNIPPETS[slug]} />}

      {isConnected ? (
        <div className="flex flex-col gap-6">{children}</div>
      ) : (
        <Panel className="text-center text-sm text-muted-foreground">Connect a wallet to play.</Panel>
      )}
    </motion.main>
  );
}

// Shown when the game's contract address env var is missing.
export function NoAddress({ env }: { env: string }) {
  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <Panel className="text-sm text-muted-foreground">
        Set <code className="text-primary">{env}</code> in <code>.env.local</code> to a deployed address, then reload.
      </Panel>
    </main>
  );
}
