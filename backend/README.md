# Backend orchestrator + Gemini narrator

Watches `ConfidentialMafia`'s public on-chain events, and turns each one
into a short narration via Gemini, posted to the game's Telegram chat.

## The confidentiality boundary

`src/publicEvent.ts` defines `PublicGameEvent` -- the only shape of data
that can reach the narrator. It is built exclusively from values the
contract has already revealed (phase changes, deaths, public day-votes, the
final winner). Private role handles and night-action targets never exist in
plaintext outside the contract/player-client, so they cannot appear here.
Keep that invariant when extending `index.ts`.

## Setup

```bash
npm install
cp .env.example .env   # fill in RPC url, contract address, bot token, chat id, Gemini key
cp ../contracts/artifacts/contracts/examples/ConfidentialMafia.sol/ConfidentialMafia.json ./abi/ConfidentialMafia.json
npm run dev
```
