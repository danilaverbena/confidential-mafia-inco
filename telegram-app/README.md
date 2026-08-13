# Telegram Mini App — Confidential Mafia

Player-facing client for Confidential Mafia, opened inside Telegram as a
Mini App (Web App). Bootstrapped from Inco's `confidential-deck-template`
frontend (`../contracts/frontend`), which already wires wallet connection +
`lib/deck.ts` (peek / readPublic / toSettleArgs) against deployed games,
including an `app/mafia` reference page.

## What's Telegram-specific here

- `app/layout.tsx` loads `https://telegram.org/js/telegram-web-app.js`
  before any client code runs, and mounts `<TelegramInit />`.
- `components/TelegramInit.tsx` calls `WebApp.ready()` / `.expand()` on
  mount. No-ops outside Telegram (e.g. plain-browser local dev).
- `lib/telegram.ts` — typed helpers: `getTelegramWebApp()`,
  `getTelegramUserId()`.

## Still to build (see ../PLAN.md section 5)

`app/mafia` currently targets the upstream `Mafia.sol` (roles only, no
night actions). It needs to be re-pointed at `ConfidentialMafia` and split
into the phase screens from the plan: Lobby (`join`), Your Role
(`myRoleHandle` + peek, shown once, locally, never sent anywhere), Night
(`submitNightAction`, identical UI regardless of role), Day (discussion +
`castDayVote`), and a live feed of the backend narrator's messages.

## Run it

```bash
npm install
cp .env.example .env.local     # WalletConnect Project ID + deployed addresses
npm run dev
```

Required env vars (`.env.local`):

- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — from https://cloud.walletconnect.com
- `NEXT_PUBLIC_NETWORK` — `testnet` (Base Sepolia) or `mainnet`
- `NEXT_PUBLIC_MAFIA_ADDRESS` (upstream demo) / a new
  `NEXT_PUBLIC_CONFIDENTIAL_MAFIA_ADDRESS` once you wire the real game page
  — see `../contracts` for `npm run deploy:confidential-mafia:testnet`.

## What you'll need to actually ship this in Telegram

1. A bot token from **@BotFather** (`/newbot`).
2. This app deployed on an **HTTPS domain** (Vercel works out of the box —
   see `vercel.json`).
3. That domain registered as the bot's **Web App URL**
   (`/newapp` in BotFather, or `setChatMenuButton` via the Bot API).
4. A **WalletConnect Project ID** (free, from cloud.walletconnect.com) —
   or swap RainbowKit for an embedded/burner wallet provider for a
   friendlier in-Telegram UX with no external wallet app required.
