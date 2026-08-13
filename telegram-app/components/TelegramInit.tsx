"use client";

import { useEffect } from "react";
import { getTelegramWebApp } from "@/lib/telegram";

/** Mounted once in the root layout. Calls ready()/expand() as soon as the
 * Telegram WebApp SDK script (loaded in app/layout.tsx) is available.
 * No-ops outside Telegram (e.g. local dev in a plain browser). */
export function TelegramInit() {
  useEffect(() => {
    const tg = getTelegramWebApp();
    if (!tg) return;
    tg.ready();
    tg.expand();
  }, []);
  return null;
}
