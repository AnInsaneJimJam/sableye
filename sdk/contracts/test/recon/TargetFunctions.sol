// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTargetFunctions} from "@chimera/BaseTargetFunctions.sol";
import {vm} from "@chimera/Hevm.sol";
import {Properties} from "./Properties.sol";
import {SubscriptionManager} from "../../src/SubscriptionManager.sol";

/// Actions the fuzzers sequence: subscribe, charge, cancel, wallet drain/top-up/revoke, and time passing.
abstract contract TargetFunctions is BaseTargetFunctions, Properties {
    function subscribe(uint256 payerSeed, uint256 planSeed, uint8 capCycles) public {
        uint256 k = planSeed % 2;
        address payer = payers[payerSeed % payers.length];
        uint256 cap = plans[k].amount * between(capCycles, 1, 12);
        vm.prank(payer);
        try sm.subscribe(plans[k], sigs[k], cap) returns (bytes32 id) {
            ghostCancelled[id] = false;
        } catch {}
    }

    function charge(uint256 payerSeed, uint256 planSeed) public {
        bytes32 id = _subId(payerSeed, planSeed);
        SubscriptionManager.Subscription memory before = sm.getSubscription(id);
        try sm.charge(id) {
            SubscriptionManager.Subscription memory afterS = sm.getSubscription(id);
            if (afterS.charged > before.charged) {
                if (block.timestamp < before.nextChargeAt) earlyCharges++;
                if (ghostCancelled[id]) chargesAfterCancel++;
            }
        } catch {}
    }

    function cancel(uint256 payerSeed, uint256 planSeed, bool byMerchant) public {
        bytes32 id = _subId(payerSeed, planSeed);
        vm.prank(byMerchant ? merchant : payers[payerSeed % payers.length]);
        try sm.cancel(id) {
            ghostCancelled[id] = true;
        } catch {}
    }

    /// Covers the automatic cancel after MAX_FAILED_CHARGES too.
    function syncCancelled(uint256 payerSeed, uint256 planSeed) public {
        bytes32 id = _subId(payerSeed, planSeed);
        if (sm.getSubscription(id).status == SubscriptionManager.Status.Cancelled) ghostCancelled[id] = true;
    }

    function drainWallet(uint256 payerSeed) public {
        address payer = payers[payerSeed % payers.length];
        uint256 bal = token.balanceOf(payer);
        vm.prank(payer);
        token.transfer(address(0xdead), bal);
    }

    function topUp(uint256 payerSeed, uint256 amount) public {
        token.mint(payers[payerSeed % payers.length], between(amount, 1, 500e6));
    }

    function setAllowance(uint256 payerSeed, bool on) public {
        vm.prank(payers[payerSeed % payers.length]);
        token.approve(address(sm), on ? type(uint256).max : 0);
    }

    function wait(uint256 seconds_) public {
        vm.warp(block.timestamp + between(seconds_, 0, 7200));
    }
}
