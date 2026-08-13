"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// Full-screen blur + pulsing dots for a multi-step wait (e.g. dealer playing).
export function FullScreenLoader({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[100] grid place-items-center bg-background/70 backdrop-blur-md"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-2.5 w-2.5 bg-primary"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </div>
        <span className="text-sm uppercase tracking-widest text-primary">{text}</span>
      </div>
    </motion.div>
  );
}

// Square terminal button; outline variant inverts on hover.
export function Button({
  className,
  variant = "solid",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "outline" }) {
  return (
    <button
      className={cn(
        "px-4 py-2.5 text-sm uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-35",
        variant === "solid"
          ? "bg-primary text-primary-foreground hover:bg-primary/85"
          : "border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground",
        className,
      )}
      {...props}
    />
  );
}

// Bordered navy panel.
export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("border-2 border-border bg-card/60 p-5 backdrop-blur-sm", className)} {...props} />
  );
}

// Live status line: pending tx phase, or a loading hint. Renders nothing when idle.
export function TxBar({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="flex items-center gap-2 border border-primary/40 bg-primary/5 px-3 py-2 text-xs uppercase tracking-widest text-primary">
      <span className="h-1.5 w-1.5 animate-pulse bg-primary" />
      {text}...
    </div>
  );
}

// A numbered step so the flow reads top to bottom.
export function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        <span className="grid h-5 w-5 place-items-center border border-primary text-primary">{n}</span>
        {title}
      </div>
      {children}
    </div>
  );
}
