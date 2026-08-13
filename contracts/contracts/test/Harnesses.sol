// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BlackjackMath} from "../examples/BlackjackMath.sol";

/// @notice Test-only wrapper for pure scoring. Not for prod.
contract BlackjackMathHarness {
    function bestTotal(uint8[] calldata ids) external pure returns (uint256) {
        uint8[] memory m = ids;
        return BlackjackMath.bestTotal(m);
    }

    function dealerTotal(uint8[] calldata ids) external pure returns (uint256) {
        uint8[] memory m = ids;
        return BlackjackMath.dealerTotal(m);
    }
}
