"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { GAMES } from "@/lib/games";
import { KIT_SNIPPET } from "@/lib/snippets";
import { CodePeek } from "@/components/CodePeek";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-53px)] max-w-3xl flex-col px-6 py-14">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-10"
      >
        <h1 className="mb-2 text-xl uppercase tracking-wide text-primary">confidential deck</h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Four small games on Inco. The deck is shuffled and dealt by Inco, so a card stays
          secret until the rules reveal it. One contract, four examples to build from.
        </p>
      </motion.div>

      <div className="grid gap-3 sm:grid-cols-2">
        {GAMES.map((g, i) => (
          <motion.div
            key={g.slug}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.06 * i }}
          >
            <Link
              href={`/${g.slug}`}
              className="group block border-2 border-border bg-card/50 p-5 transition-colors hover:border-primary"
            >
              <div className="mb-1 flex items-baseline gap-2">
                <span className="text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                <span className="uppercase tracking-wide text-foreground group-hover:text-primary">{g.name}</span>
                <span className="ml-auto border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                  {g.wallets}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{g.tagline}</p>
              <p className="mt-3 text-[11px] text-muted-foreground">
                <span className="text-primary">secret:</span> {g.secret}
              </p>
            </Link>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="mt-8"
      >
        <p className="mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">how little it takes</p>
        <CodePeek code={KIT_SNIPPET} title="the whole confidential surface" />
      </motion.div>
    </main>
  );
}
