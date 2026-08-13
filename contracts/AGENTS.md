# AGENTS.md

Onboarding for an AI agent (or a developer) picking up this repo. It's a
**template**: a reusable Inco "confidential deck" primitive plus four small
games and a Next.js frontend, meant to be copied and extended. Read this top to
bottom and you'll know how everything fits before touching code.

Inco is TEE-based confidential compute for the EVM - NOT FHE, NOT zk.
"encrypted" means decrypt-in-a-TEE; "provably fair" means a covalidator
attestation. Docs: https://docs.inco.org. Install the skill for deeper API help:
`npx skills add Inco-fhevm/skills`, then invoke `/lightning`.

## What this template is

- A base contract, **`ConfidentialDeck`** (`contracts/kit/ConfidentialDeck.sol`),
  that wraps the five confidential moves every hidden-card game needs. You
  inherit it and write only your game rules.
- Four worked games built on it: **War, Blackjack, Raffle, Mafia**
  (`contracts/examples/`).
- A **Next.js + RainbowKit** frontend (`frontend/`) that plays all four, with a
  thin client half (`frontend/lib/deck.ts`) mirroring the contract kit.

## Repo layout

```
contracts/
  kit/ConfidentialDeck.sol   the base contract you inherit (the whole confidential surface)
  CardLib.sol                52-card <-> (rank, suit) encoding (optional; card games only)
  examples/
    War.sol                  2-player, auto-matchmaking tables (rooms)
    Blackjack.sol            solo vs house; player hand face-up, dealer hole hidden
    Raffle.sol               N tickets, one shuffle picks a hidden winner (non-card)
    Mafia.sol                per-player secret role (no on-chain settlement)
    BlackjackMath.sol        pure blackjack scoring (no Inco)
  test/Harnesses.sol         external wrappers to unit-test pure libs (no covalidator)
ignition/modules/            one Ignition deploy module per game
scripts/                     wire-frontend.mjs (addresses -> frontend .env), fund.ts
test/                        Docker-free unit tests + full covalidator integration tests
frontend/                    the demo dApp (see "Frontend" below)
```

## The kit: five confidential moves

`ConfidentialDeck` exposes exactly these (everything else in a game is plain
Solidity):

| Move | Call | Under the hood |
| --- | --- | --- |
| Shuffle | `_newShuffledDeck(n)` | `e.shuffledRange(1, n+1, ETypes.Uint256)` - one TEE op |
| Draw | `_draw()` | `e.getEuint256(deck, i)` (+ `allowThis` so it survives cross-tx) |
| Deal (private) | `_dealTo(player)` | `card.allow(player)` - only they can decrypt it |
| Reveal (public) | `_dealFaceUp()` / `_revealCard(c)` | `e.reveal(c)` - public forever |
| Settle | `_verifyValue(c, value, sigs)` | `e.verifyDecryption(...)` - value bound to the handle |

Fees: only `_newShuffledDeck` costs an Inco fee (`deckFee(n)`), drawn from the
contract balance. Forward it from a `payable` entrypoint or pre-fund the
contract. The `allowThis` inside `_draw` is load-bearing - `getEuint256` alone
gives only transient (this-tx) access, so a card you store and reveal in a later
tx would otherwise be inaccessible.

### Adding a new game

1. `contract MyGame is ConfidentialDeck { ... }`.
2. Shuffle with `_newShuffledDeck`, deal with `_dealTo` (private) or
   `_dealFaceUp` (public), read at settlement with `_verifyValue`.
3. Expose the card handles via a view so the frontend can decrypt/reveal them.
4. Add an Ignition module, a deploy script, and a frontend page (copy the
   closest example).

## Privacy model (what stays secret, per game)

The deck order is always secret (one TEE shuffle; unused cards never revealed).
Per game:

- **War** - each player's hole card is private (`_dealTo`), revealed to everyone
  only at showdown. Folded/other tables never leak.
- **Blackjack** - the player's hand is dealt FACE-UP on purpose (solo vs house,
  no opponent to hide from; keeps the UI signature-free). The confidential part
  is the **dealer's hole card + the undealt shoe**, hidden (`_draw`) until the
  player stands.
- **Raffle** - the winning ticket is a hidden draw, unknowable (even to the
  deployer) until `draw()` reveals it. Entrant addresses/ticket numbers are
  public by nature.
- **Mafia** - each role is `_dealTo` its owner; only that player can decrypt it.
  No role is ever revealed on-chain (Model B - social play is off-chain).

**No plaintext card/role value is ever emitted in an event or stored in the
clear** - contracts only hold `bytes32` handles; plaintext appears on-chain only
at a deliberate `e.reveal`/`_verifyValue` settlement point. `e.verifyDecryption`
binds the signed value to the stored handle, so a valid attestation for a
different handle can't be substituted.

## Matchmaking & replay

- **War** uses a **rooms array**: `join()` seats you at an open table or opens a
  new one - a busy table never blocks a newcomer. `roomOfPlayer(addr)` finds
  your table; re-joining after a hand opens a fresh table (the "New game").
- **Blackjack** replays by dealing again (gated on claiming prior winnings).
- **Raffle** `newRound()` / **Mafia** `reset()` reopen for a fresh round.

## Frontend

Next.js App Router + wagmi + RainbowKit + `@inco/lightning-js`, scaffolded from
Inco's official `create-inco-app --template frontend` and restyled.

- `lib/deck.ts` - the client half of the kit: `peek(wallet, handles)`
  (decrypt your own, signs), `readPublic(handles)` (read revealed, no wallet),
  `toSettleArgs(...)`, `decodeCard(value)`.
- `lib/games.ts` - game registry (name, tagline, secret, wallet-count badge) and
  deployed addresses from `NEXT_PUBLIC_*_ADDRESS`.
- `hooks/useTx.ts` - one write + receipt wait; toasts on success AND on-chain
  revert; exposes `busy`/`phase`/`hash`.
- `components/` - `Card` (flip), `GameShell` (header + connect + privacy note),
  `ConnectWallet` (custom connect + wrong-network button), `Providers` (wagmi +
  RainbowKit pinned to `darkTheme` so its modal matches the terminal palette),
  `ui` (Button, Panel, Step, TxBar, FullScreenLoader).
- `app/<game>/page.tsx` - each game is one self-contained page (read it to see
  the whole flow: deal -> reveal -> settle).

### Design system (why it looks the way it does)

Borrowed from Inco's hangman + mines apps for a "confidential terminal" look -
deliberately NOT casino-gamey:

- **Font:** `DepartureMono` (pixel monospace), at `frontend/app/fonts/
  DepartureMono-Regular.woff`, loaded via `next/font/local` as `--font-mono`.
  Copied from the hangman app.
- **Palette:** navy background `#020B20`, electric-blue accent `#3673F5`, deep
  blue borders. Set once as HSL vars in `app/globals.css` (same values in
  `:root` and `.dark`, so it's always terminal). Square everything
  (`--radius: 0`), no drop shadows.
- **Background texture:** `public/bg-lines.svg` blueprint grid (from hangman),
  fixed behind everything in `globals.css`.

### Animation

`framer-motion` for card flips + a small `canvas-confetti` burst on a win
(`lib/confetti.ts`, in the terminal palette, `disableForReducedMotion`, fired
once per hand via a ref guard). Keep motion subtle:

- **Card flip** (`components/Card.tsx`): `motion.div` rotates `rotateY` 0->180 on
  reveal. `initial={false}` is important - the card must NOT animate on mount/
  re-render, only on a real face-down -> face-up change, or it "spins" on every
  render.
- **Card components must live at module scope**, never defined inside a page
  component - an inline component gets a new identity each render and React
  remounts it, replaying the flip on every click. (This bit Blackjack once.)
- **Full-screen loader** (`FullScreenLoader`): blurred overlay + pulsing dots for
  multi-step waits (e.g. Blackjack's "dealer playing" during stand->settle).
- **TxBar**: inline pending/loading line for normal txs and reads.
- **Async reads are cancellable** where a retry loop can outlive a state change
  (see Blackjack's `loadRun` ref) so a stale read can't overwrite fresh cards.

### Frontend gotchas worth knowing

- Reads use a `refetchInterval` so the UI self-heals after any tx even if the
  immediate refetch races the RPC node.
- `attestedDecrypt` (private peek) signs per call; `attestedReveal` (public) does
  not. Blackjack deliberately uses only public reads so there are no signature
  prompts beyond the game txs.
- Each browser wallet is one identity. War (2 wallets) and Mafia (2+) need
  multiple wallets; Blackjack and Raffle work with one. The home page badges
  this per game.

## Run / test / deploy

```bash
# contracts
npm install
npm run compile
npm test                 # pure-logic units, no Docker
npm run node:up          # local Inco node (docker compose)
npm run test:local       # full games end-to-end on a real covalidator
npm run deploy:war:testnet   # (+ :blackjack :raffle :mafia) -> Base Sepolia
npm run wire:frontend        # write deployed addresses into frontend/.env.local

# frontend
cd frontend && npm install
cp .env.example .env.local   # WalletConnect id + the deployed addresses
npm run dev
```

Package/image versions must match: `@inco/lightning{,-js}@1.0.2` with
`inconetwork/local-node-{anvil,covalidator}-mainnet:v1.0.2` - a mismatch fails
at the elist shuffle with a ciphertext MAC error.

## Conventions

Short, human comments (Solidity: <= 2-line blocks; TS: 1-liners). No em dashes or
middots anywhere. Reference-grade code; audit before real funds.
