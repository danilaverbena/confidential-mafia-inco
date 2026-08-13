# Telegram Mini App (Web App)

This is the player-facing client, opened inside Telegram as a Mini App
(Web App). Fastest path to a working one: bootstrap from
`../contracts/frontend`, which already wires wallet connection and
`incoDeckClient.ts` (peekMyCards / readRevealed / packForSettle) against the
deployed games, including `app/mafia`. Copy that as a starting point rather
than rebuilding wallet + Inco plumbing from scratch:

```bash
cp -r ../contracts/frontend/* .
cp -r ../contracts/frontend/.env.example .env.local
npm install
```

Then layer the Telegram-specific pieces already stubbed in this folder:

- `lib/telegram.ts` -- typed wrapper around the Telegram WebApp JS SDK
  (initData, theme, MainButton). Load `https://telegram.org/js/telegram-web-app.js`
  in the root layout before using it.
- `app/` -- add screens for the phases in the plan: Lobby (`join`), Your Role
  (`peekMyRole`, shown once, locally, never sent anywhere), Night
  (`submitNightAction`, same UI regardless of role), Day (discussion +
  `castDayVote`), and a live feed of the backend's narrator messages.

## What you'll need to actually ship this in Telegram

See the "Что нужно для Telegram" section the assistant sent in chat --
summarized: a bot token from @BotFather, an HTTPS domain for the Mini App
registered as the bot's Web App URL, and (if using an embedded wallet) that
provider's API key.
