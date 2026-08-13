# Confidential card recipes (Inco Lightning v1)

Copy-paste snippets for the confidential moves behind any hidden-information
game - a shuffled deck no one can predict, cards only their owner can see, a
trustless reveal at settlement. Each recipe is one move. Reach for the
[`ConfidentialDeck`](contracts/kit/ConfidentialDeck.sol) base contract to get
all of them at once; the raw `e.*` calls are shown so you know what it does.

> Inco is **TEE-based** confidential compute - not FHE, not zk. "Secret" means
> decrypt-in-TEE; "provably fair" means a covalidator attestation, not a proof.

Setup once:

```solidity
import {euint256, elist, ETypes, e, inco} from "@inco/lightning/src/Lib.sol";
using e for *;
```

---

## 1. Shuffle a deck (unpredictable to everyone)

One TEE op produces the values `1..n` in a secret permutation - no per-card RNG,
no bias, no `blockhash` to front-run.

```solidity
elist deck = e.shuffledRange(1, n + 1, ETypes.Uint256); // values 1..n, secret order
e.allow(deck, address(this));                            // keep access across txs (REQUIRED)
```

- **Cost:** `2 * inco.getEListFee(n, ETypes.Uint256)` (range + shuffle), from the
  contract balance. Forward it as `msg.value`, or pre-fund to sponsor players.
- **Secret:** the order. **Public:** `n` (list length is always public on Inco).

> Kit: `_newShuffledDeck(n)` does exactly this and resets the draw pointer.

---

## 2. Draw the next card

Reading a card returns an opaque handle - it does **not** reveal the value.
Disclosure is a separate, deliberate step (recipes 3 - 4).

```solidity
euint256 card = e.getEuint256(deck, index); // free; index is a public position
```

> Kit: `_draw()` returns the next card and advances a public pointer.

---

## 3. Deal a card only its owner can see (private hand / secret role)

The `allow` grant is the privacy boundary - only `player` can decrypt it; the
contract never emits the value.

```solidity
card.allowThis();        // contract keeps access (needed if you reveal it later)
card.allow(player);      // ONLY this address can decrypt it off-chain
```

- **Secret from:** everyone except `player`. **One-way:** a grant can't be revoked
 - never `allow` a hand to the wrong address (that's a one-line leak).

> Kit: `_dealTo(player)` draws + does both grants.

Frontend - the owner peeks their card (signs once):

```ts
const [card] = await peekMyCards(zap, walletClient, [handle]); // attestedDecrypt under the hood
```

---

## 4. Put a card face-up (board card / dice roll)

Makes the value publicly decryptable **forever** - irreversible, so reveal only
what the rules force open, at the latest safe moment.

```solidity
card.allowThis();
e.reveal(card);
```

> Kit: `_revealCard(card)`, or `_dealFaceUp()` to draw + reveal in one call.

Frontend - anyone reads a revealed card (no wallet):

```ts
const cards = await readRevealed(zap, handles); // attestedReveal under the hood
```

---

## 5. Settle on a revealed card, trustlessly

At settlement the contract needs the plaintext value on-chain. The frontend
brings a covalidator-signed attestation; the contract verifies it **against the
stored handle**, so a signed value for any other card can't be substituted.

```solidity
// values[i]/sigs[i] come from the frontend (attestedReveal or the owner's attestedDecrypt)
require(e.verifyDecryption(card, value, sigs), "bad attestation");
uint8 id = CardLib.toId(value); // -> rank/suit for a 52-card game
```

> Kit: `_verifyValue(card, value, sigs)` returns the verified raw value.

Frontend - package a batch for the on-chain `settle(...)`:

```ts
const revealed = await readRevealed(zap, handles);
const { values, sigs } = packForSettle(revealed);
await wallet.writeContract({ address, abi, functionName: "settle", args: [values, sigs] });
```

---

## Putting it together - a whole game in ~15 lines

Inherit the kit and write only your rules:

```solidity
import {euint256} from "@inco/lightning/src/Lib.sol";
import {ConfidentialDeck} from "./kit/ConfidentialDeck.sol";

contract War is ConfidentialDeck {
    mapping(address => euint256) public myCard;

    function startRound() external payable {
        require(msg.value >= deckFee(52), "fee");
        _newShuffledDeck(52);                 // recipe 1
    }
    function draw() external {
        myCard[msg.sender] = _dealTo(msg.sender); // recipe 3 - only you can peek it
    }
    // reveal both cards at showdown and compare with _verifyValue(...) - recipe 5
}
```

See [`examples/Blackjack.sol`](contracts/examples/Blackjack.sol) for a full
worked game: private hand, hit loop, public reveal, attested settle.

## Checklist (the three rules that break every new Inco project)

- [ ] `allowThis()` on every stored handle - a handle you can't re-access is lost forever.
- [ ] Pay the fee for `shuffledRange` (`deckFee(n)`) - from `msg.value` or a pre-funded contract.
- [ ] Never `if`/`require` on an encrypted value; never `e.reveal` a card before the rules open it.
