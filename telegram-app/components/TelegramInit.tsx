"use client";

import { useEffect } from "react";
import { getTelegramWebApp } from "@/lib/telegram";

// Known custom URL schemes mobile wallets use for their native deep links,
// mapped to the wallet's https "universal link" equivalent. Telegram's Mini
// App WebView can only navigate to http(s) URLs: handing it a raw
// `metamask://wc?uri=...` link throws `net::ERR_UNKNOWN_URL_SCHEME` instead
// of opening the wallet app (this is a documented, still-open limitation of
// Telegram's in-app browser, not a bug in our wallet setup -- see
// rainbow-me/rainbowkit#1881 and reown-com/appkit#3143). Rewriting the link
// to its https universal-link form lets Android App Links / iOS Universal
// Links take over instead, which *does* work from inside the Telegram
// webview and opens the installed wallet app (or its store page if it's
// missing).
const SCHEME_TO_UNIVERSAL_LINK: Record<string, string> = {
  "metamask://": "https://metamask.app.link/",
  "trust://": "https://link.trustwallet.com/",
  "rainbow://": "https://rnbwapp.com/",
  "cbwallet://": "https://go.cb-w.com/",
  "okx://": "https://www.okx.com/download?deeplink=",
};

function toUniversalLink(url: string): string {
  for (const [scheme, universal] of Object.entries(SCHEME_TO_UNIVERSAL_LINK)) {
    if (url.startsWith(scheme)) {
      return universal + url.slice(scheme.length);
    }
  }
  return url;
}

let patched = false;

/** Monkey-patches window.open so any raw wallet deep link (metamask://, ...)
 * gets rewritten to its https universal-link form before Telegram's webview
 * ever sees a non-http(s) scheme. Idempotent -- safe to call more than once. */
function patchWindowOpenForTelegram() {
  if (patched || typeof window === "undefined") return;
  patched = true;

  const originalOpen = window.open.bind(window);
  window.open = ((url?: string | URL, target?: string, features?: string) => {
    if (url) {
      const href = url.toString();
      const isHttp = href.startsWith("http://") || href.startsWith("https://");
      if (!isHttp) {
        return originalOpen(toUniversalLink(href), target ?? "_blank", features);
      }
    }
    return originalOpen(url, target, features);
  }) as typeof window.open;
}

/** Mounted once in the root layout. Calls ready()/expand() as soon as the
 * Telegram WebApp SDK script (loaded in app/layout.tsx) is available, and
 * patches window.open so wallet deep links work inside Telegram's webview.
 * No-ops outside Telegram (e.g. local dev in a plain browser). */
export function TelegramInit() {
  useEffect(() => {
    const tg = getTelegramWebApp();
    if (!tg) return;
    tg.ready();
    tg.expand();
    patchWindowOpenForTelegram();
  }, []);
  return null;
}
