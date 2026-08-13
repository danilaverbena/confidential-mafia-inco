# ConfidentialDeck template

A drop-in Inco Hardhat project for building **hidden-information games** - cards,
raffles, hidden roles. Inherit one base contract, write only your game rules; the
confidential deck, private deals, public reveals, and trustless settlement come
for free.

Built on [Inco Lightning v1](https://docs.inco.org) (TEE-based confidential
compute - not FHE, not zk). Scaffolded from Inco's official Hardhat template
(`create-inco-app --template contracts`), pinned to the `1.0.2` package +
local-node pairing that the elist shuffle needs.

## The five moves

Everything confidential is one call on `ConfidentialDeck`:

| Move | Kit call | Under the hood |
| --- | --- | --- |
| Shuffle | `_newShuffledDeck(n)` | `e.shuffledRange(1, n+1, ETypes.Uint256)` - one TEE op |
| Draw | `_draw()` | `e.getEuint256(deck, i)` (+ auto `allowThis`) |
| Deal (private) | `_dealTo(player)` | `card.allow(player)` - only they decrypt it |
| Reveal (public) | `_revealCard(c)` / `_dealFaceUp()` | `e.reveal(c)` |
| Settle | `_verifyValue(c, value, sigs)` | `e.verifyDecryption(...)` - handle-bound |

## Layout

```
contracts/
  kit/ConfidentialDeck.sol   the base contract you inherit (the whole confidential surface)
  CardLib.sol                optional 52-card rank/suit decoding
  examples/
    Blackjack.sol (+ BlackjackMath.sol)  private hand, hit loop, reveal, attested settle
    War.sol                              the ~50-line "hello world"
    Raffle.sol                           non-card: hidden winner from one shuffle
    Mafia.sol                            selective per-player secret roles
client/
  incoDeckClient.ts          peekMyCards / readRevealed / packForSettle (frontend half)
test/                        pure units (no Docker) + full games vs a real covalidator
ignition/modules/            Ignition deploy modules
RECIPES.md                   copy-paste snippets, one per move
```

## A whole game in ~15 lines

```solidity
import {euint256} from "@inco/lightning/src/Lib.sol";
import {ConfidentialDeck} from "./kit/ConfidentialDeck.sol";

contract War is ConfidentialDeck {
    mapping(address => euint256) public myCard;

    function startRound() external payable {
        require(msg.value >= deckFee(52), "fee");
        _newShuffledDeck(52);
    }
    function draw() external {
        myCard[msg.sender] = _dealTo(msg.sender); // only the caller can peek it
    }
    // showdown + _verifyValue(...) to settle
}
```

Frontend:

```ts
import { getZap, peekMyCards, decodeCard } from "./client/incoDeckClient";

const zap = await getZap({ local: true });
const [c0, c1] = await peekMyCards(zap, wallet, handles);
console.log(decodeCard(c0.value).label); // e.g. "A♠"
```

## The four worked examples

Each is a full, tested game - read them to see the kit assembled:

- **[Blackjack](contracts/examples/Blackjack.sol)** - private hand, hit loop, public dealer upcard, reveal-all, attested settle, pull payout.
- **[War](contracts/examples/War.sol)** - the smallest game: one private card each, higher rank wins.
- **[Raffle](contracts/examples/Raffle.sol)** - the kit isn't just for cards: one shuffle picks a hidden winner, revealed at the draw.
- **[Mafia](contracts/examples/Mafia.sol)** - selective reveal: each player privately learns only their own role.

See **[RECIPES.md](RECIPES.md)** for copy-paste snippets, one per move.

## Build & test

```bash
npm install                # @inco/lightning + @inco/lightning-js v1.0.2
npm run compile

npm test                   # pure-logic units (blackjack scoring) - no Docker
npm run node:up            # docker compose up -d (anvil + covalidator v1.0.2)
npm run test:local         # 8 tests: units + Blackjack/War/Raffle/Mafia end-to-end
npm run node:down
```

> Package and image versions must match: `@inco/lightning{,-js}@1.0.2` with
> `inconetwork/local-node-{anvil,covalidator}-mainnet:v1.0.2`. A mismatch fails
> at the elist shuffle with a ciphertext MAC error.

