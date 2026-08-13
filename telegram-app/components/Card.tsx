"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface CardProps {
  faceUp: boolean;
  label?: string; // "A♠", "#7", "MAFIA", etc.
  red?: boolean;
  loading?: boolean; // pulse while decrypting
  hint?: string;
}

// A card that flips face up on reveal; pulses while decrypting.
export function Card({ faceUp, label, red, loading, hint }: CardProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="[perspective:1000px]">
        <motion.div
          className="relative h-36 w-24 [transform-style:preserve-3d]"
          initial={false}
          animate={{ rotateY: faceUp ? 180 : 0 }}
          transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
        >
          {/* back */}
          <div
            className={cn(
              "absolute inset-0 grid place-items-center border-2 border-primary [backface-visibility:hidden]",
              "bg-[repeating-linear-gradient(45deg,transparent,transparent_7px,hsl(var(--primary)/0.14)_7px,hsl(var(--primary)/0.14)_9px)]",
              loading && "animate-pulse",
            )}
          >
            <span className="text-primary/70 text-lg">{loading ? "***" : "?"}</span>
          </div>
          {/* face - size text to the label so words like MAFIA fit */}
          <div
            className={cn(
              "absolute inset-0 grid place-items-center border-2 border-primary bg-card px-1 text-center leading-none [backface-visibility:hidden] [transform:rotateY(180deg)]",
              !label || label.length <= 2 ? "text-4xl" : label.length <= 3 ? "text-2xl" : "text-sm tracking-wide",
            )}
            style={{ color: red ? "hsl(0 72% 60%)" : "hsl(var(--foreground))" }}
          >
            {label ?? "?"}
          </div>
        </motion.div>
      </div>
      {hint ? <span className="text-[11px] uppercase tracking-widest text-muted-foreground">{hint}</span> : null}
    </div>
  );
}
