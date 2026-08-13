# Confidential deck - demo frontend

A minimal Next.js + RainbowKit dApp that plays the four example games (War,
Blackjack, Raffle, Mafia) built on `ConfidentialDeck`. Each game is one
self-contained page under `app/<game>/page.tsx` - read one to see the whole
flow: deal, private peek, public reveal, attested settle.

## The confidential bits

All of it goes through `lib/deck.ts`:

- `peek(walletClient, handles)` - decrypt YOUR cards (only the owner can).
- `readPublic(handles)` - read cards the contract revealed to everyone.
- `toSettleArgs(cards)` - shape revealed cards into the `settle()` inputs.

`decodeCard(value)` turns a 1..52 deck value into a rank + suit.

## Run it

```bash
npm install
cp .env.example .env.local     # fill in the addresses + a WalletConnect id
npm run dev
```

You need the example contracts deployed and their addresses in `.env.local`.
From the contracts project (one folder up):

```bash
npm run deploy:war:local       # or :blackjack, on anvil / Base Sepolia
```

Then set `NEXT_PUBLIC_WAR_ADDRESS`, `NEXT_PUBLIC_BLACKJACK_ADDRESS`,
`NEXT_PUBLIC_RAFFLE_ADDRESS`, `NEXT_PUBLIC_MAFIA_ADDRESS`.

## Notes

- Each browser wallet is one player. War needs two players, so open a second
  wallet in another browser to see that your opponent's card stays hidden.
- Blackjack's house and Mafia's shuffle fee are paid from the contract balance,
  so fund the contract after deploying.
- Cards flip with framer-motion; a win pops confetti. Tune in `components/Card.tsx`.

## Files

```
app/            home grid + one page per game
components/      Card (flip), GameShell, ui primitives
lib/deck.ts     peek / readPublic / decodeCard  (the confidential frontend half)
lib/games.ts    game registry + deployed addresses
hooks/useTx.ts  write + receipt-wait + toast
abi/            the four example ABIs
```
