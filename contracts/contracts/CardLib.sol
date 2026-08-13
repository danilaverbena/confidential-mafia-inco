// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title CardLib
/// @notice Card encoding shared by table and evaluator.
/// @dev value-1 = cardId; bigger rank = stronger (Ace high).
library CardLib {
    uint8 internal constant DECK_SIZE = 52;
    uint8 internal constant NUM_RANKS = 13;
    uint8 internal constant NUM_SUITS = 4;

    /// @dev Ace index; avoid hardcoding 12.
    uint8 internal constant RANK_ACE = 12;

    error CardOutOfRange(uint256 value);

    /// @notice Deck value 1..52 to cardId 0..51.
    function toId(uint256 deckValue) internal pure returns (uint8) {
        if (deckValue < 1 || deckValue > DECK_SIZE) revert CardOutOfRange(deckValue);
        return uint8(deckValue - 1);
    }

    function rankOf(uint8 cardId) internal pure returns (uint8) {
        return cardId % NUM_RANKS;
    }

    function suitOf(uint8 cardId) internal pure returns (uint8) {
        return cardId / NUM_RANKS;
    }

    /// @notice Card label like "As" (debug/tests).
    function toString(uint8 cardId) internal pure returns (string memory) {
        bytes memory rankChars = "23456789TJQKA";
        bytes memory suitChars = "cdhs";
        bytes memory out = new bytes(2);
        out[0] = rankChars[rankOf(cardId)];
        out[1] = suitChars[suitOf(cardId)];
        return string(out);
    }
}
