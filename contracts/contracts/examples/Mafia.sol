// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {euint256} from "@inco/lightning/src/Lib.sol";
import {ConfidentialDeck} from "../kit/ConfidentialDeck.sol";

/// @title Mafia - per-player hidden roles.
/// @notice Each seat gets a role token only they can decrypt.
/// @dev Value <= mafiaCount means Mafia. No on-chain settlement.
contract Mafia is ConfidentialDeck {
    uint16 public immutable mafiaCount;
    uint256 public round; // a new round reopens joining
    address[] public players;
    mapping(address => euint256) private roleOf; // readable only by its owner
    mapping(address => bool) public seated;

    enum State { Joining, Assigned }
    State public state;

    event Joined(address indexed player);
    event RolesAssigned(uint16 players, uint16 mafia);
    event NewRound(uint256 round);

    constructor(uint16 _mafiaCount) {
        require(_mafiaCount >= 1, "need mafia");
        mafiaCount = _mafiaCount;
    }

    function join() external {
        require(state == State.Joining, "closed");
        require(!seated[msg.sender], "already joined");
        seated[msg.sender] = true;
        players.push(msg.sender);
        emit Joined(msg.sender);
    }

    /// @notice Shuffle and deal a private role to each seat.
    /// @dev Pre-fund the shuffle fee; anyone can then trigger it.
    function assignRoles() external {
        require(state == State.Joining, "already assigned");
        uint16 n = uint16(players.length);
        require(n > mafiaCount, "too few players");
        require(address(this).balance >= deckFee(n), "fund shuffle fee first");

        _newShuffledDeck(n); // KIT: shuffle roles 1..n
        for (uint256 i = 0; i < n; i++) {
            roleOf[players[i]] = _dealTo(players[i]); // KIT: only this player reads their role
        }
        state = State.Assigned;
        emit RolesAssigned(n, mafiaCount);
    }

    /// @notice Reopen joining for a fresh game. Anyone can call once assigned.
    function reset() external {
        require(state == State.Assigned, "not assigned");
        for (uint256 i = 0; i < players.length; i++) {
            seated[players[i]] = false; // old roleOf entries stay dead until overwritten
        }
        delete players;
        round += 1;
        state = State.Joining;
        emit NewRound(round);
    }

    /// @notice Your role handle. Mafia iff value <= mafiaCount.
    function myRoleHandle() external view returns (bytes32) {
        return euint256.unwrap(roleOf[msg.sender]);
    }

    /// @notice A seat's role handle; opaque to non-owners.
    function roleHandleOf(address who) external view returns (bytes32) {
        return euint256.unwrap(roleOf[who]);
    }

    function playerCount() external view returns (uint256) {
        return players.length;
    }

    /// @notice Anyone can pre-fund the shuffle fee.
    receive() external payable {}
}
