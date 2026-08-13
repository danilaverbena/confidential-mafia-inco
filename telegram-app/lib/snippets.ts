// The few confidential lines behind each screen, shown in a collapsible peek so
// players can see how little Solidity the kit takes. Trimmed from the contracts.

export const KIT_SNIPPET = `// Inherit the kit, then just five moves:
contract MyGame is ConfidentialDeck {
  _newShuffledDeck(52);          // one shuffle, on inco
  euint256 card = _draw();       // draw one, still hidden
  _dealTo(player);               // only they can decrypt it
  _dealFaceUp();                 // or reveal to everyone
  _verifyValue(card, v, sigs);   // settle against the handle
}`;

export const SNIPPETS: Record<string, string> = {
  war: `_newShuffledDeck(52);                 // one inco shuffle
cards[0] = _dealTo(players[0]);       // private card, seat 0
cards[1] = _dealTo(players[1]);       // private card, seat 1
// at showdown:
_revealCard(cards[0]);                // now public
_verifyValue(cards[0], value, sigs);  // attested at settle`,

  blackjack: `_newShuffledDeck(52);
playerCards.push(_dealFaceUp());   // your cards are public
dealerCards.push(_dealFaceUp());   // dealer upcard: public
dealerCards.push(_draw());         // hole + shoe: hidden
// when you stand, reveal the dealer:
_revealCard(dealerCards[i]);`,

  raffle: `_newShuffledDeck(n);        // shuffle tickets 1..n
winningTicket = _draw();    // pick one, still hidden
_revealCard(winningTicket); // reveal the winner
// pay out after attestation:
_verifyValue(winningTicket, ticket, sigs);`,

  mafia: `_newShuffledDeck(n);        // shuffle roles 1..n
for (uint i; i < n; i++)
  roleOf[players[i]] = _dealTo(players[i]);
// each role is private; nothing is revealed on-chain`,
};
