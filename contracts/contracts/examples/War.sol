// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {euint256} from "@inco/lightning/src/Lib.sol";
import {ConfidentialDeck} from "../kit/ConfidentialDeck.sol";
import {CardLib} from "../CardLib.sol";

/// @title War - the smallest game on ConfidentialDeck.
/// @notice One private card each; higher rank wins. Auto-matchmaking: join
///         drops you into an open table, or opens a new one if all are busy.
contract War is ConfidentialDeck {
    using CardLib for uint8;

    enum State { Open, Dealt, Revealing, Done }

    struct Room {
        address[2] players;
        euint256[2] cards;
        uint8 seated;
        uint256 pot; // winnable here (bets minus the shuffle fee)
        uint8 winnerSeat; // 0/1 winner, 2 split, 3 unset
        State state;
    }

    uint256 public immutable bet;
    Room[] private rooms;
    mapping(address => uint256) public payout; // pull-payment credit across all tables

    event TableOpened(uint256 indexed roomId);
    event Joined(uint256 indexed roomId, address indexed player, uint8 seat);
    event Dealt(uint256 indexed roomId);
    event Showdown(uint256 indexed roomId);
    event Result(uint256 indexed roomId, uint8 winnerSeat, uint256 amount);

    constructor(uint256 _bet) {
        require(_bet > 0, "bet=0");
        bet = _bet;
    }

    /// @notice Sit at an open table (or a fresh one) with exactly `bet`.
    function join() external payable returns (uint256 roomId) {
        require(msg.value == bet, "wrong bet");
        roomId = _matchRoom();
        Room storage r = rooms[roomId];
        r.players[r.seated] = msg.sender;
        r.pot += msg.value;
        emit Joined(roomId, msg.sender, r.seated);
        r.seated += 1;
        if (r.seated == 2) _deal(roomId);
    }

    /// @dev Reuse an open table with a free seat, else open a new one.
    function _matchRoom() private returns (uint256) {
        for (uint256 i = rooms.length; i > 0; i--) {
            Room storage r = rooms[i - 1];
            if (r.state == State.Open && r.seated < 2 && r.players[0] != msg.sender) return i - 1;
        }
        rooms.push();
        uint256 id = rooms.length - 1;
        rooms[id].state = State.Open;
        rooms[id].winnerSeat = 3;
        emit TableOpened(id);
        return id;
    }

    function _deal(uint256 roomId) private {
        Room storage r = rooms[roomId];
        _newShuffledDeck(52); // KIT: shuffle
        uint256 fee = deckFee(52); // shuffle is paid from this table's pot
        r.pot = r.pot > fee ? r.pot - fee : 0;
        r.cards[0] = _dealTo(r.players[0]); // KIT: private deal to seat 0
        r.cards[1] = _dealTo(r.players[1]); // KIT: private deal to seat 1
        r.state = State.Dealt;
        emit Dealt(roomId);
    }

    /// @notice Open both cards at a table. Un-griefable.
    function showdown(uint256 roomId) external {
        Room storage r = rooms[roomId];
        require(r.state == State.Dealt, "not dealt");
        _revealCard(r.cards[0]); // KIT: open to everyone
        _revealCard(r.cards[1]); // KIT: open to everyone
        r.state = State.Revealing;
        emit Showdown(roomId);
    }

    /// @notice Post attested values and credit the winner at a table.
    function settle(uint256 roomId, uint256[2] calldata values, bytes[][2] calldata sigs) external {
        Room storage r = rooms[roomId];
        require(r.state == State.Revealing, "call showdown first");
        uint8 a = CardLib.rankOf(CardLib.toId(_verifyValue(r.cards[0], values[0], sigs[0]))); // KIT: verify
        uint8 b = CardLib.rankOf(CardLib.toId(_verifyValue(r.cards[1], values[1], sigs[1]))); // KIT: verify

        uint256 p = r.pot;
        if (a > b) {
            payout[r.players[0]] += p;
            r.winnerSeat = 0;
        } else if (b > a) {
            payout[r.players[1]] += p;
            r.winnerSeat = 1;
        } else {
            uint256 half = p / 2;
            payout[r.players[0]] += half;
            payout[r.players[1]] += p - half;
            r.winnerSeat = 2;
        }
        r.state = State.Done;
        emit Result(roomId, r.winnerSeat, p);
    }

    /// @notice Pull winnings from any tables you won (reentrancy-safe).
    function claim() external {
        uint256 amount = payout[msg.sender];
        require(amount > 0, "nothing");
        payout[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "transfer failed");
    }

    // ── Views for the frontend ──────────────────────────────────────────────

    function roomCount() external view returns (uint256) {
        return rooms.length;
    }

    /// @notice A table's public state (cards stay encrypted; only handles/rank leak).
    function roomOf(uint256 id)
        external
        view
        returns (address p0, address p1, uint8 seated, uint8 winnerSeat, uint8 state, uint256 pot)
    {
        Room storage r = rooms[id];
        return (r.players[0], r.players[1], r.seated, r.winnerSeat, uint8(r.state), r.pot);
    }

    /// @notice The latest table a player sits at, or -1 if none. Frontend uses
    ///         this to find "your" table after matchmaking placed you.
    function roomOfPlayer(address who) external view returns (int256) {
        for (uint256 i = rooms.length; i > 0; i--) {
            Room storage r = rooms[i - 1];
            if (r.players[0] == who || r.players[1] == who) return int256(i - 1);
        }
        return -1;
    }

    /// @notice A seat's private card handle at a table (decrypt off-chain).
    function cardHandle(uint256 id, uint8 seat) external view returns (bytes32) {
        return euint256.unwrap(rooms[id].cards[seat]);
    }
}
