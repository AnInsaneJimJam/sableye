// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseSetup} from "@chimera/BaseSetup.sol";
import {vm} from "@chimera/Hevm.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SubscriptionManager} from "../../src/SubscriptionManager.sol";

contract ReconToken is ERC20("Tether USD", "USDT") {
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

/// Shared setup for Foundry, Medusa and Echidna (Chimera): one merchant, two signed plans, three payers.
abstract contract Setup is BaseSetup {
    SubscriptionManager sm;
    ReconToken token;
    uint256 constant MERCHANT_KEY = 0xA11CE;
    address merchant;
    address payout = address(0xFEE);
    address[3] payers = [address(0x10000), address(0x20000), address(0x30000)];
    SubscriptionManager.Plan[2] plans;
    bytes[2] sigs;

    // Ghost state for the temporal properties.
    mapping(bytes32 => bool) ghostCancelled;
    uint256 earlyCharges; // successful charge before the sub's nextChargeAt
    uint256 chargesAfterCancel; // successful charge on a cancelled sub (without resubscribing)

    function setup() internal virtual override {
        vm.warp(1_000_000);
        merchant = vm.addr(MERCHANT_KEY);
        sm = new SubscriptionManager();
        token = new ReconToken();
        plans[0] = SubscriptionManager.Plan("basic", merchant, payout, address(token), 5e6, 120, type(uint64).max);
        plans[1] = SubscriptionManager.Plan("pro", merchant, payout, address(token), 20e6, 3600, type(uint64).max);
        for (uint256 i; i < 2; i++) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(MERCHANT_KEY, sm.hashPlan(plans[i]));
            sigs[i] = abi.encodePacked(r, s, v);
        }
        for (uint256 i; i < payers.length; i++) {
            token.mint(payers[i], 1_000e6);
            vm.prank(payers[i]);
            token.approve(address(sm), type(uint256).max);
        }
    }

    function _subId(uint256 payerSeed, uint256 planSeed) internal view returns (bytes32) {
        return sm.subscriptionId(merchant, plans[planSeed % 2].planId, payers[payerSeed % payers.length]);
    }
}
