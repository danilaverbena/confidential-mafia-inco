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
      `0x6376083c809EdC04ebBB69038AA999C1B4fE755D`
      (`ConfidentialMafia(mafiaCount=1)`).
- [x] Telegram Mini App **deployed**: https://confidential-mafia-inco.vercel.app
      (bootstrapped from `contracts/frontend`; `app/mafia` still targets the
      upstream roles-only `Mafia.sol`, not yet re-pointed at
      `ConfidentialMafia`).
- [x] Telegram bot menu button wired to the live Mini App
      (`@incoprotocol_bot`, "Play Mafia").
- [x] Backend orchestrator **live** on the server: watches
      `ConfidentialMafia` on Base Sepolia, narrates public events via
      Gemini, posts to the "IncoNetwork" Telegram group.
- [x] **Full round-1 flow verified live on Base Sepolia**, not just
      compiled: 3 wallets joined, `assignRoles()` ran a real Inco
      `shuffledRange` + 3x `_dealTo`, emitting `DeckShuffled`,
      `CardDealt` x3, `RolesAssigned(players=3, mafia=1)`, and the
      automatic `NightStarted(round=0)`. The orchestrator picked up every
      event, correctly narrated only the player-facing ones (joins, roles
      assigned, night started) and silently skipped the low-level deck
      events, and Gemini's narration landed in Telegram each time. Nobody
      -- not even someone holding all 3 private keys, as in this test --
      can tell who the Mafia is from any of this; that requires each
      wallet individually running `attestedDecrypt` on its own role
      handle.

### Still needed from you

- `app/mafia` in `telegram-app` still targets the upstream, roles-only
  `Mafia.sol`. Re-point it at the deployed `ConfidentialMafia` address
  above (ABI in `backend/abi/ConfidentialMafia.json`, regenerate from
  `contracts/artifacts/...` if the contract changes) and build the
  night/day screens per PLAN.md section 5.
- The contract has **no Base Sepolia ETH pre-funded for the shuffle fee**
  yet -- send some ETH to
  `0x6376083c809EdC04ebBB69038AA999C1B4fE755D` (it has a `receive()`)
  before calling `assignRoles()`, or fund it programmatically in the
  frontend flow.
- The deployed contract has now run a **full test round 1** with 3
  throwaway wallets (deployer + 2 generated test keys) and is sitting in
  `Night` state with roles already dealt. `reset()` only works from
  `GameOver`, so this instance is spent as a real game -- deploy a fresh
  `ConfidentialMafia` (same `npm run deploy:confidential-mafia:testnet`)
  before onboarding real players.
- The orchestrator (`backend`) is running via `npm run dev` in the
  background on the server (not a managed service yet -- wrap it in
  `pm2`/`systemd` before relying on it long-term).
- **WalletConnect Project ID** (free, cloud.walletconnect.com) -- the live
  Mini App currently runs on a placeholder value in Vercel's project env
  vars, so wallet connect will not work until this is set for real.
- Vercel note: a git-linked redeploy got blocked by team policy
  ("Git author ... must have access to the team Danyla's projects") after
  `vercel link` auto-attached the GitHub repo. The **first** deploy (live
  now) went through fine as a direct CLI upload. To allow future
  git-triggered deploys, either invite the relevant GitHub-linked account to
  the Danyla's projects Vercel team, or disconnect the project's Git
  Integration and keep deploying via `vercel deploy --prod` from the server.

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
