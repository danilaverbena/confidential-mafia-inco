"use client";

import Link from "next/link";

// Brand only. Wallet connect lives on each game page.
const Header = () => {
  return (
    <header className="sticky top-0 z-50 border-b-2 border-border bg-background/70 backdrop-blur-sm">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
        <Link href="/" className="text-sm uppercase tracking-widest text-primary">
          confidential_deck
        </Link>
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground">inco</span>
      </div>
    </header>
  );
};

export { Header };
