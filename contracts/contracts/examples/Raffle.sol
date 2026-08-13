// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {euint256} from "@inco/lightning/src/Lib.sol";
import {ConfidentialDeck} from "../kit/ConfidentialDeck.sol";

/// @title Raffle - the kit isn't just for cards.
/// @notice One TEE shuffle picks the winner; nobody can rig it.
/// @dev Deck value is a ticket number, not a card.
contract Raffle is ConfidentialDeck {
    uint256 public immutable ticketPrice;
    uint16 public immutable minEntrants;
    address[] public entrants; // ticket i+1 => entrants[i]
    euint256 private winningTicket; // hidden until the draw
    address public winner;
    uint256 public prize;
    uint256 public round; // current draw; a new round reopens ticket sales

    enum State { Selling, Drawing, Paid }
    State public state;

    event Entered(address indexed player, uint256 ticket);
    event Drawn(bytes32 winningTicketHandle);
    event Won(address indexed winner, uint256 prize);
    event NewRound(uint256 round);

    constructor(uint256 _ticketPrice, uint16 _minEntrants) {
        require(_ticketPrice > 0 && _minEntrants >= 2, "bad config");
        ticketPrice = _ticketPrice;
        minEntrants = _minEntrants;
    }

    /// @notice Buy one ticket. Winner isn't decided until `draw`.
    function enter() external payable {
        require(state == State.Selling, "closed");
        require(msg.value == ticketPrice, "wrong price");
        require(entrants.length < type(uint16).max, "full");
        entrants.push(msg.sender);
        emit Entered(msg.sender, entrants.length); // 1-based ticket number
    }

    /// @notice Close entries and draw the winning ticket.
    /// Anyone may call once minEntrants is reached.
    function draw() external payable {
        require(state == State.Selling, "already drawn");
        uint16 n = uint16(entrants.length);
        require(n >= minEntrants, "not enough entrants");
        require(msg.value >= deckFee(n), "shuffle fee");

        _newShuffledDeck(n); // KIT: shuffle tickets 1..n
        winningTicket = _draw(); // KIT: top card wins, still hidden
        _revealCard(winningTicket); // KIT: reveal it publicly

        prize = ticketPrice * n;
        state = State.Drawing;
        emit Drawn(euint256.unwrap(winningTicket));
    }

    /// @notice Post attested ticket and pay the winner.
    function settle(uint256 ticket, bytes[] calldata sigs) external {
        require(state == State.Drawing, "not drawing");
        uint256 value = _verifyValue(winningTicket, ticket, sigs); // KIT: verify against stored handle
        winner = entrants[value - 1]; // ticket value is 1-based
        state = State.Paid;
        (bool ok,) = payable(winner).call{value: prize}("");
        require(ok, "payout failed");
        emit Won(winner, prize);
    }

    /// @notice Reopen ticket sales for a fresh draw. Anyone can call once paid.
    function newRound() external {
        require(state == State.Paid, "not finished");
        delete entrants;
        winner = address(0);
        prize = 0;
        round += 1;
        state = State.Selling;
        emit NewRound(round);
    }

    function winningTicketHandle() external view returns (bytes32) {
        return euint256.unwrap(winningTicket);
    }

    function entrantCount() external view returns (uint256) {
        return entrants.length;
    }
}
