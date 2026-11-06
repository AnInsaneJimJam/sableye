// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SubscriptionManager} from "../src/SubscriptionManager.sol";

contract SubToken is ERC20("Tether USD", "USDT") {
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract SubscriptionManagerTest is Test {
    SubscriptionManager sm;
    SubToken usdt;
    uint256 merchantKey = 0xA11CE;
    address merchant = vm.addr(merchantKey);
    address payout = makeAddr("payout");
    address payer = makeAddr("payer");
    uint64 constant INTERVAL = 120; // 2-minute demo interval

    function setUp() public {
        vm.warp(1_000_000);
        sm = new SubscriptionManager();
        usdt = new SubToken();
        usdt.mint(payer, 100e6);
        vm.prank(payer);
        usdt.approve(address(sm), type(uint256).max);
    }

    function _plan(bytes32 id) internal view returns (SubscriptionManager.Plan memory) {
        return SubscriptionManager.Plan(id, merchant, payout, address(usdt), 5e6, INTERVAL, uint64(block.timestamp + 1 days));
    }

    function _sign(SubscriptionManager.Plan memory p) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(merchantKey, sm.hashPlan(p));
        return abi.encodePacked(r, s, v);
    }

    function _subscribe(uint256 cap) internal returns (bytes32) {
        SubscriptionManager.Plan memory p = _plan("pro");
        bytes memory sig = _sign(p);
        vm.prank(payer);
        return sm.subscribe(p, sig, cap);
    }

    function test_subscribeChargesFirstCycle() public {
        bytes32 id = _subscribe(50e6);
        assertEq(id, sm.subscriptionId(merchant, "pro", payer));
        assertEq(usdt.balanceOf(payout), 5e6);
        SubscriptionManager.Subscription memory s = sm.getSubscription(id);
        assertEq(uint8(s.status), uint8(SubscriptionManager.Status.Active));
        assertEq(s.nextChargeAt, block.timestamp + INTERVAL);
        assertEq(usdt.balanceOf(address(sm)), 0);
    }

    function test_renewalAfterInterval() public {
        bytes32 id = _subscribe(50e6);
        vm.expectRevert(abi.encodeWithSelector(SubscriptionManager.NotDue.selector, uint64(block.timestamp + INTERVAL)));
        sm.charge(id);
        vm.warp(block.timestamp + INTERVAL);
        assertTrue(sm.charge(id));
        assertEq(usdt.balanceOf(payout), 10e6);
        // Can't charge twice for the same cycle.
        vm.expectRevert();
        sm.charge(id);
    }

    function test_failedChargeGoesPastDueThenRecovers() public {
        bytes32 id = _subscribe(50e6);
        uint256 bal = usdt.balanceOf(payer);
        vm.prank(payer);
        usdt.transfer(makeAddr("elsewhere"), bal); // customer's wallet is empty
        vm.warp(block.timestamp + INTERVAL);
        assertFalse(sm.charge(id)); // doesn't revert
        assertEq(uint8(sm.getSubscription(id).status), uint8(SubscriptionManager.Status.PastDue));

        usdt.mint(payer, 5e6); // customer tops up
        assertTrue(sm.charge(id)); // retry succeeds
        SubscriptionManager.Subscription memory s = sm.getSubscription(id);
        assertEq(uint8(s.status), uint8(SubscriptionManager.Status.Active));
        assertEq(s.failedCharges, 0);
    }

    function test_threeFailuresCancel() public {
        bytes32 id = _subscribe(50e6);
        vm.prank(payer);
        usdt.approve(address(sm), 0); // allowance revoked
        vm.warp(block.timestamp + INTERVAL);
        sm.charge(id);
        sm.charge(id);
        sm.charge(id);
        assertEq(uint8(sm.getSubscription(id).status), uint8(SubscriptionManager.Status.Cancelled));
        vm.expectRevert(abi.encodeWithSelector(SubscriptionManager.NotActive.selector, SubscriptionManager.Status.Cancelled));
        sm.charge(id);
    }

    function test_capStopsCharges() public {
        bytes32 id = _subscribe(10e6); // two cycles
        vm.warp(block.timestamp + INTERVAL);
        sm.charge(id);
        vm.warp(block.timestamp + INTERVAL);
        vm.expectRevert(SubscriptionManager.CapReached.selector);
        sm.charge(id);
        assertEq(usdt.balanceOf(payout), 10e6);
    }

    function test_cancelByPayerOrMerchantOnly() public {
        bytes32 id = _subscribe(50e6);
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(SubscriptionManager.NotAuthorized.selector);
        sm.cancel(id);
        vm.prank(payer);
        sm.cancel(id);
        vm.warp(block.timestamp + INTERVAL);
        vm.expectRevert(abi.encodeWithSelector(SubscriptionManager.NotActive.selector, SubscriptionManager.Status.Cancelled));
        sm.charge(id);
    }

    function test_resubscribeAfterCancel() public {
        bytes32 id = _subscribe(50e6);
        vm.prank(merchant);
        sm.cancel(id);
        assertEq(_subscribe(50e6), id);
        assertEq(uint8(sm.getSubscription(id).status), uint8(SubscriptionManager.Status.Active));
    }

    function test_revert_doubleSubscribe() public {
        _subscribe(50e6);
        SubscriptionManager.Plan memory p = _plan("pro");
        bytes memory sig = _sign(p);
        vm.prank(payer);
        vm.expectRevert(SubscriptionManager.AlreadySubscribed.selector);
        sm.subscribe(p, sig, 50e6);
    }

    function test_revert_badSignatureExpiredRevokedCap() public {
        SubscriptionManager.Plan memory p = _plan("pro");
        bytes memory sig = _sign(p);
        SubscriptionManager.Plan memory t = _plan("pro");
        t.amount = 1;
        vm.prank(payer);
        vm.expectRevert(SubscriptionManager.InvalidSignature.selector);
        sm.subscribe(t, sig, 50e6);

        vm.prank(payer);
        vm.expectRevert(SubscriptionManager.CapTooLow.selector);
        sm.subscribe(p, sig, 1);

        vm.prank(merchant);
        sm.revokePlan("pro");
        vm.prank(payer);
        vm.expectRevert(SubscriptionManager.PlanIsRevoked.selector);
        sm.subscribe(p, sig, 50e6);

        SubscriptionManager.Plan memory e = _plan("old");
        bytes memory esig = _sign(e);
        vm.warp(e.expiry + 1);
        vm.prank(payer);
        vm.expectRevert(SubscriptionManager.PlanExpired.selector);
        sm.subscribe(e, esig, 50e6);
    }

    function testFuzz_chargesNeverExceedSchedule(uint32 elapsed, uint8 attempts) public {
        bytes32 id = _subscribe(1_000e6);
        uint256 start = block.timestamp;
        vm.warp(start + elapsed);
        for (uint256 i; i < attempts % 20; i++) {
            try sm.charge(id) {} catch {}
        }
        uint256 cycles = 1 + elapsed / INTERVAL;
        assertLe(sm.getSubscription(id).charged, cycles * 5e6);
        assertEq(usdt.balanceOf(address(sm)), 0);
    }
}
