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
