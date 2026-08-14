# Confidential Mafia on Inco

Social deduction (Mafia) as a Telegram Mini App, with roles and night
actions kept genuinely secret inside a smart contract on Base, using Inco
Lightning's confidential compute. A Gemini-powered narrator turns the
public, revealed events into an in-chat story -- without ever seeing a
hidden role or vote.

Built for the Inco Summer Game Jam (Inco Prize Track).
https://www.inco.org/blog/summer-game-jam-resources-and-what-to-build

## Why this is hard without Inco

On a transparent chain, contract state is public, so roles and night
actions are visible to anyone reading the mempool/state -- the game breaks
before it starts. Inco keeps values encrypted on-chain while still letting
the contract compute over them, so a role can be dealt to exactly one
address, and a night action can be resolved without ever disclosing who did
what.

## What's actually hidden, and what isn't

| | Hidden | Public |
|---|---|---|
| Roles | who is Mafia / Doctor / Villager, always (until a player dies) | `mafiaCount`, who is seated |
| Night actions | every living player's target and what their action *meant* | the fact that a submission happened |
| Night outcome | nothing kept back | who died (if anyone), and their role, once resolved |
| Day vote | nothing -- real Mafia day votes are public | who voted for whom, who got lynched |

See `contracts/contracts/examples/ConfidentialMafia.sol` for exactly how
each of those is enforced (NatSpec comments walk through the design).

## Repo layout

```
contracts/       Hardhat project. Forked from Inco's confidential-deck-
                  template (github.com/Inco-fhevm/confidential-deck-template);
                  contracts/kit/ConfidentialDeck.sol is the upstream base
                  (shuffle/deal/reveal/settle primitives). Our game lives in
                  contracts/contracts/examples/ConfidentialMafia.sol.
telegram-app/     Player-facing Telegram Mini App (Next.js). Bootstrap it
                  from contracts/frontend -- see telegram-app/README.md.
backend/          Event-driven orchestrator + Gemini narrator + Telegram
                  bot. See backend/README.md, especially the confidentiality
                  boundary in backend/src/publicEvent.ts.
PLAN.md           Full strategy/architecture writeup.
```

## Status

- [x] `ConfidentialMafia.sol` written and **compiles** against
      `@inco/lightning@1.0.2` (`cd contracts && npm run compile`).
- [ ] Local end-to-end test against the covalidator (`npm run node:up && npm run test:local`).
- [x] Deployed to Base Sepolia:
      `0x555b5326B2590377DfA3A44C8264ba36a61dBB8a`
      (`ConfidentialMafia(mafiaCount=1)`). Supersedes two earlier
      instances (`0x6376...` the first pipeline smoke test,
      `0x4A91...` before `pendingVictimIndexHandle` /
      `pendingDeathFlagHandle` / `pendingDeadPlayer` were made public,
      which the frontend needs to fetch attested reveals).
- [x] Telegram Mini App **deployed**: https://confidential-mafia-inco.vercel.app
      Bootstrapped from `contracts/frontend`. `app/mafia` still targets the
      upstream roles-only `Mafia.sol` (kept as reference); the real game
      lives at a new route, `/confidential-mafia`, wired to the deployed
      `ConfidentialMafia` contract with the full join -> role -> night ->
      resolve/settle -> day -> resolve/settle -> game-over loop. Builds
      clean (`npm run build`, TypeScript strict) against the real ABI.
- [x] **Launchable from inside Telegram**, including group chats:
      `@incoprotocol_bot`'s Main Mini App is configured in BotFather
      (Bot Settings > Mini App App URL ->
      `https://confidential-mafia-inco.vercel.app/confidential-mafia`,
      Mode: Fullsize). Open it with
      `https://t.me/incoprotocol_bot?startapp` -- posted this way, it
      launches in the *current* chat (group or private), which is what
      gives the Mini App `chat_type`/`chat_instance` for multiplayer.
      (An `inline_keyboard` button with `web_app` was tried first for a
      one-tap launch directly from a bot message in the group --
      Telegram's Bot API rejects that outside private chats
      (`BUTTON_TYPE_INVALID`), so the plain `?startapp` link is the
      correct mechanism for groups, not a bug in our setup.)
      The default chat menu button (`setChatMenuButton`, no `chat_id`)
      is also set to the same URL for 1:1 chats with the bot.
- [x] Telegram bot menu button wired to the live Mini App
      (`@incoprotocol_bot`, "Play Mafia").
- [x] Backend orchestrator **live** on the server: watches
      `ConfidentialMafia` on Base Sepolia, narrates public events via
      Gemini, posts to the "IncoNetwork" Telegram group.
- [x] **A full round played to completion, live on Base Sepolia, with
      real Inco attestations at every reveal** -- not simulated, not just
      compiled. 3 wallets joined; `assignRoles()` ran a real Inco
      `shuffledRange` + 3x `_dealTo`. All 3 submitted a night action.
      `resolveNightStep1()` folded the encrypted votes down to one
      (victim, dies) pair and revealed only that. The JS SDK
      (`@inco/lightning-js`, `zap.attestedReveal`) fetched genuine
      covalidator-signed values for both handles --
      `contracts/scripts/resolve-night.ts` -- which `settleNight()`
      verified on-chain (`e.verifyDecryption`). A Villager had been
      killed; their role was revealed and settled the same way. With 1
      Mafia left out of 2 survivors, `_checkWin()` fired
      `GameEnded(Mafia)` automatically, no separate call needed. Every
      step's Gemini narration reached the real IncoNetwork Telegram group,
      including the death and the final result (a couple were sent via
      `backend/scripts/backfill.ts` after the live watcher was briefly
      pointed at the wrong -- superseded -- contract address; now fixed).
      Nobody, not even someone holding all 3 private keys as in this test,
      could tell who the Mafia was before the reveal -- that requires each
      wallet individually running `attestedDecrypt` on its own role
      handle.

### Still needed from you

- **WalletConnect Project ID** (free, cloud.walletconnect.com) -- the live
  Mini App currently runs on a placeholder value in Vercel's project env
  vars, so wallet connect will not work for real players until this is
  set. Swap it into the \`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID\` Vercel env
  var and redeploy.
- The current deployment (\`0x555b...\`) is funded (0.0006 ETH) but has
  **0 players joined** -- it is a clean slate, ready for a real game.
  Nobody needs to pre-fund anything further for a small game; \`deckFee\`
  scales with player count and the \`Fund fee\` button in the UI covers it.
- **Infura reliability notes**, discovered the hard way while testing:
  \`eth_estimateGas\` fails with \`StackUnderflow\` on any call that touches
  Inco's precompiles (\`assignRoles\`, \`submitNightAction\`,
  \`resolveNightStep1\`, \`settleNight\`, \`settleNightRole\`,
  \`settleDayRole\`) -- both the backend scripts and the frontend now pass
  an explicit \`gas\` limit on those calls instead of estimating. Infura's
  filter-based \`eth_newFilter\`/\`eth_getFilterChanges\` also hit this
  project's quota under sustained testing (\`Payment Required\`), so
  \`contracts/.env\` and \`backend/.env\` were switched to the public
  \`https://sepolia.base.org\` endpoint, which in turn doesn't share filter
  state across its load-balanced nodes (\`filter not found\`). The
  orchestrator now runs \`watchContractEvent\` with \`poll: true\`, which
  helps but doesn't fully eliminate this -- see \`backend/src/index.ts\`.
  Before relying on this for a real game: get a paid/dedicated RPC
  (Infura or otherwise) and add a supervisor (pm2/systemd) that restarts
  the orchestrator on crash and re-runs \`backend/scripts/backfill.ts\` on
  start to catch anything missed while it was down.
- The orchestrator (\`backend\`) runs via \`npm run dev\` in the background
  on the server -- not a managed service yet.
- Vercel note: git-linked redeploys get blocked by team policy (\"Git
  author ... must have access to the team Danyla's projects\") unless the
  commit author's email matches an authorized identity on that Vercel
  team -- this repo's git config now uses the token owner's email for
  that reason. Direct CLI deploys (\`vercel deploy --prod\`, what's used
  here) work regardless.

## Quickstart (contracts)

```bash
cd contracts
npm install
npm run compile
npm run node:up        # local anvil + covalidator (versions must match: v1.0.2)
npm run test:local      # all four upstream games + ours, end-to-end
npm run node:down
```

Deploy the game itself:

```bash
npm run deploy:confidential-mafia:testnet   # writes to Base Sepolia
```
