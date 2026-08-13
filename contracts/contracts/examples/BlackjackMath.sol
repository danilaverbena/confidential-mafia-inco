// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {CardLib} from "../CardLib.sol";

/// @title BlackjackMath - pure hand scoring, no Inco.
/// @notice Plain Solidity on revealed card ids.
library BlackjackMath {
    /// @notice Card point value (ace = 11; bestTotal demotes it).
    function value(uint8 cardId) internal pure returns (uint8) {
        uint8 rank = CardLib.rankOf(cardId); // 0='2' .. 12='A'
        if (rank <= 7) return rank + 2; // 2..9
        if (rank <= 11) return 10; // T, J, Q, K
        return 11; // A
    }

    /// @notice Best total, avoiding bust when possible.
    function bestTotal(uint8[] memory ids) internal pure returns (uint256 total) {
        uint256 aces;
        for (uint256 i = 0; i < ids.length; i++) {
            total += value(ids[i]);
            if (CardLib.rankOf(ids[i]) == CardLib.RANK_ACE) aces += 1;
        }
        // demote aces 11->1 while busting
        while (total > 21 && aces > 0) {
            total -= 10;
            aces -= 1;
        }
    }

    function isBust(uint8[] memory ids) internal pure returns (bool) {
        return bestTotal(ids) > 21;
    }

    /// @notice A two-card 21 (natural blackjack).
    function isBlackjack(uint8[] memory ids) internal pure returns (bool) {
        return ids.length == 2 && bestTotal(ids) == 21;
    }

    /// @notice Dealer hits until >= 17, then stands.
    /// @dev Caller must pass enough cards to reach 17.
    function dealerTotal(uint8[] memory ids) internal pure returns (uint256) {
        // starts with two cards, then hits
        for (uint256 k = 2; k <= ids.length; k++) {
            uint8[] memory prefix = new uint8[](k);
            for (uint256 i = 0; i < k; i++) {
                prefix[i] = ids[i];
            }
            uint256 t = bestTotal(prefix);
            if (t >= 17) return t;
        }
        return bestTotal(ids);
    }
}
