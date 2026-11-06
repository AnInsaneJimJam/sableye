// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {FoundryAsserts} from "@chimera/FoundryAsserts.sol";
import {TargetFunctions} from "./TargetFunctions.sol";

/// The same properties under Foundry's invariant fuzzer.
contract CryticToFoundry is Test, TargetFunctions, FoundryAsserts {
    function setUp() public {
        setup();
        targetContract(address(this));
        bytes4[] memory selectors = new bytes4[](8);
        selectors[0] = this.subscribe.selector;
        selectors[1] = this.charge.selector;
        selectors[2] = this.cancel.selector;
        selectors[3] = this.syncCancelled.selector;
        selectors[4] = this.drainWallet.selector;
        selectors[5] = this.topUp.selector;
        selectors[6] = this.setAllowance.selector;
        selectors[7] = this.wait.selector;
        targetSelector(FuzzSelector({addr: address(this), selectors: selectors}));
    }

    function invariant_foundry_schedule() public view {
        assertTrue(property_chargesWithinSchedule(), "charges exceed schedule or cap");
    }

    function invariant_foundry_noEarlyCharge() public view {
        assertTrue(property_noEarlyCharge(), "charged before the interval");
    }

    function invariant_foundry_cancelStops() public view {
        assertTrue(property_cancelStopsCharges(), "charged after cancel");
    }

    function invariant_foundry_noCustody() public view {
        assertTrue(property_managerHoldsNothing(), "manager holds tokens");
    }
}
