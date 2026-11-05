// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Asserts} from "@chimera/Asserts.sol";
import {Setup} from "./Setup.sol";
import {SubscriptionManager} from "../../src/SubscriptionManager.sol";

/// Subscription properties (#48). Each returns true when it holds, so Medusa/Echidna can run them in property mode.
abstract contract Properties is Setup, Asserts {
    /// Total charges never exceed amount × cycles elapsed (first cycle charged at subscribe), nor the cap.
    function property_chargesWithinSchedule() public view returns (bool) {
        for (uint256 p; p < payers.length; p++) {
            for (uint256 k; k < 2; k++) {
                SubscriptionManager.Subscription memory s = sm.getSubscription(_subId(p, k));
                if (s.status == SubscriptionManager.Status.None) continue;
                uint256 cycles = 1 + (block.timestamp - s.startedAt) / s.interval;
                if (s.charged > s.amount * cycles || s.charged > s.cap) return false;
            }
        }
        return true;
    }

    /// No charge succeeds before the interval since the previous one has passed.
    function property_noEarlyCharge() public view returns (bool) {
        return earlyCharges == 0;
    }

    /// Once cancelled, a subscription is never charged again (until the payer subscribes anew).
    function property_cancelStopsCharges() public view returns (bool) {
        return chargesAfterCancel == 0;
    }

    /// The manager never holds tokens.
    function property_managerHoldsNothing() public view returns (bool) {
        return token.balanceOf(address(sm)) == 0;
    }
}
