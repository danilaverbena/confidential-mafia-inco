// Minimal typed wrapper around the Telegram WebApp JS SDK.
// Load https://telegram.org/js/telegram-web-app.js in your root layout
// before calling any of this (it attaches window.Telegram.WebApp).

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: { id: number; username?: string; first_name?: string };
    chat?: { id: number; type: string; title?: string };
  };
  ready(): void;
  expand(): void;
  /** Opens a link in an *external* browser tab (Chrome Custom Tab / Safari
   * View Controller), not the Mini App's own embedded webview. Unlike the
   * embedded webview, the external browser handles wallet deep links and
   * window.opener-based popups normally -- this is the standard escape
   * hatch for wallet-connect flows that don't work inside the Mini App
   * webview itself. */
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  MainButton: {
    text: string;
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
  };
  themeParams: Record<string, string>;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

/** Telegram user id from initData, or null outside Telegram (e.g. local dev). */
export function getTelegramUserId(): number | null {
  return getTelegramWebApp()?.initDataUnsafe.user?.id ?? null;
}

/** True when running inside Telegram's Mini App webview (as opposed to a
 * normal desktop/mobile browser tab). */
export function isInsideTelegram(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    Telegram?: { WebApp?: unknown };
    TelegramWebviewProxy?: unknown;
  };
  return Boolean(w.Telegram?.WebApp || w.TelegramWebviewProxy);
}

/** Reopens the current page in an external browser tab via Telegram's own
 * openLink bridge. Wallet deep links, popups (Coinbase Smart Wallet) and
 * WalletConnect's async redirect all depend on browser behavior the Mini
 * App's embedded webview doesn't provide (see Providers.tsx for the full
 * writeup) -- opening in an external tab sidesteps all of it at once. */
export function openCurrentPageInExternalBrowser(): void {
  const tg = getTelegramWebApp();
  if (!tg) return;
  tg.openLink(window.location.href);
}
