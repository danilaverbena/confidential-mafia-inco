// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {euint256, e} from "@inco/lightning/src/Lib.sol";
import {ConfidentialDeck} from "../kit/ConfidentialDeck.sol";
import {CardLib} from "../CardLib.sol";
import {BlackjackMath} from "./BlackjackMath.sol";

/// @title Blackjack - worked example on ConfidentialDeck.
/// @notice Player vs house. Confidential moves are the `// KIT` lines.
/// @dev House is pre-funded; keep it above max payout.
contract Blackjack is ConfidentialDeck {
    using CardLib for uint8;

    uint16 private constant DECK = 52;
    uint16 private constant DEALER_CARDS = 9; // enough to always reach 17
    uint16 private constant MAX_PLAYER_CARDS = 11;
    uint256 public constant REVEAL_TIMEOUT = 1 hours;

    enum State { Idle, PlayerTurn, Revealing, Done }

    State public state;
    address public player;
    uint256 public bet;
    uint256 public revealDeadline;
    uint256 public winnings; // pull-payment credit

    euint256[] private playerCards; // all private to the player
    euint256[] private dealerCards; // index 0 public; rest hidden until stand

    event GameStarted(address indexed player, uint256 bet);
    event PlayerHit(uint256 cardCount);
    event PlayerStood();
    event Settled(uint256 playerTotal, uint256 dealerTotal, string outcome, uint256 payout);

    error WrongState(State expected, State actual);
    error NotPlayer();

    modifier inState(State s) {
        if (state != s) revert WrongState(s, state);
        _;
    }

    modifier onlyPlayer() {
        if (msg.sender != player) revert NotPlayer();
        _;
    }

    // ── Play ────────────────────────────────────────────────────────────────

    /// @notice Bet and get dealt in. Playable again once the last hand is done
    ///         and its winnings are claimed. House pays the shuffle fee.
    function deal() external payable {
        require(state == State.Idle || state == State.Done, "hand in progress");
        require(winnings == 0, "claim your winnings first");
        require(msg.value > 0, "bet required");
        require(address(this).balance >= msg.value * 2 + deckFee(DECK), "house underfunded");

        delete playerCards; // fresh hand
        delete dealerCards;
        player = msg.sender;
        bet = msg.value;

        _newShuffledDeck(DECK); // KIT: shuffle

        // Your two cards are dealt FACE UP (like a real table) - no signature to
        // view them. The confidential part is the dealer's hole card + the shoe.
        playerCards.push(_dealFaceUp()); // KIT: public
        playerCards.push(_dealFaceUp()); // KIT: public

        // dealer: one public upcard, then a hidden hole + buffer
        dealerCards.push(_dealFaceUp()); // KIT: public upcard
        for (uint256 i = 1; i < DEALER_CARDS; i++) {
            dealerCards.push(_draw()); // KIT: hidden draw
        }

        state = State.PlayerTurn;
        emit GameStarted(msg.sender, msg.value);
    }

    /// @notice Hit: take another face-up card.
    function hit() external onlyPlayer inState(State.PlayerTurn) {
        require(playerCards.length < MAX_PLAYER_CARDS, "hand full");
        playerCards.push(_dealFaceUp()); // KIT: public
        emit PlayerHit(playerCards.length);
    }

    /// @notice Stand: reveal the dealer's hidden cards so anyone can settle.
    function stand() external onlyPlayer inState(State.PlayerTurn) {
        for (uint256 i = 1; i < dealerCards.length; i++) {
            _revealCard(dealerCards[i]); // KIT: open dealer's hidden cards
        }
        state = State.Revealing;
        revealDeadline = block.timestamp + REVEAL_TIMEOUT;
        emit PlayerStood();
    }

    // ── Settlement ────────────────────────────────────────────────────────────

    /// @notice Settle with attested values. Permissionless after stand.
    function settle(
        uint256[] calldata playerValues,
        bytes[][] calldata playerSigs,
        uint256[] calldata dealerValues,
        bytes[][] calldata dealerSigs
    ) external inState(State.Revealing) {
        require(playerValues.length == playerCards.length, "player count");
        require(dealerValues.length == dealerCards.length, "dealer count");

        // KIT: verify each value, then decode
        uint8[] memory p = new uint8[](playerValues.length);
        for (uint256 i = 0; i < playerValues.length; i++) {
            p[i] = CardLib.toId(_verifyValue(playerCards[i], playerValues[i], playerSigs[i]));
        }
        uint8[] memory d = new uint8[](dealerValues.length);
        for (uint256 i = 0; i < dealerValues.length; i++) {
            d[i] = CardLib.toId(_verifyValue(dealerCards[i], dealerValues[i], dealerSigs[i]));
        }

        // ── plain blackjack rules (no Inco) ──
        uint256 pt = BlackjackMath.bestTotal(p);
        uint256 dt = BlackjackMath.dealerTotal(d);
        uint256 payout;
        string memory outcome;

        if (pt > 21) outcome = "player bust"; // payout stays 0
        else if (dt > 21 || pt > dt) (payout, outcome) = (bet * 2, "player wins");
        else if (pt == dt) (payout, outcome) = (bet, "push");
        else outcome = "dealer wins"; // payout stays 0

        winnings = payout;
        state = State.Done;
        emit Settled(pt, dt, outcome, payout);
    }

    /// @notice House keeps the pot if no one settles in time.
    function houseTimeout() external inState(State.Revealing) {
        require(block.timestamp >= revealDeadline, "not timed out");
        state = State.Done; // bet stays with the house
        emit Settled(0, 0, "timeout", 0);
    }

    /// @notice Pull winnings (reentrancy-safe).
    function claim() external onlyPlayer inState(State.Done) {
        uint256 amount = winnings;
        require(amount > 0, "nothing to claim");
        winnings = 0;
        (bool ok,) = payable(player).call{value: amount}("");
        require(ok, "transfer failed");
    }

    /// @notice Fund the house bankroll.
    receive() external payable {}

    // ── Views for the frontend ──────────────────────────────────────────────

    function playerHandHandles() external view returns (bytes32[] memory out) {
        out = new bytes32[](playerCards.length);
        for (uint256 i = 0; i < playerCards.length; i++) {
            out[i] = euint256.unwrap(playerCards[i]);
        }
    }

    function dealerHandHandles() external view returns (bytes32[] memory out) {
        out = new bytes32[](dealerCards.length);
        for (uint256 i = 0; i < dealerCards.length; i++) {
            out[i] = euint256.unwrap(dealerCards[i]);
        }
    }
}
