// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DepositFactory} from "../src/DepositFactory.sol";

contract MockToken {
    mapping(address => uint256) public balanceOf;
    bool public returnsBool;

    constructor(bool returnsBool_) {
        returnsBool = returnsBool_;
    }

    function mint(address to, uint256 amt) external {
        balanceOf[to] += amt;
    }

    // Returns bool or nothing depending on mode (USDT mainnet returns nothing).
    fallback(bytes calldata data) external returns (bytes memory) {
        require(bytes4(data[:4]) == bytes4(keccak256("transfer(address,uint256)")), "unsupported");
        (address to, uint256 amt) = abi.decode(data[4:], (address, uint256));
        balanceOf[msg.sender] -= amt;
        balanceOf[to] += amt;
        return returnsBool ? abi.encode(true) : bytes("");
    }
}

contract DepositFactoryTest is Test {
    DepositFactory factory = new DepositFactory();
    MockToken usdt = new MockToken(true);
    address merchant = makeAddr("merchant");
    address attacker = makeAddr("attacker");
    bytes32 intentId = keccak256("pi_1");

    function test_addressKnownBeforeDeployAndMatchesAfter() public {
        address predicted = factory.computeAddress(merchant, intentId);
        assertEq(predicted.code.length, 0);
        usdt.mint(predicted, 5e6);
        factory.sweep(merchant, intentId, address(usdt));
        assertGt(predicted.code.length, 0);
        assertEq(usdt.balanceOf(merchant), 5e6);
        assertEq(usdt.balanceOf(predicted), 0);
    }

    function test_secondSweepAfterTopUp() public {
        address deposit = factory.computeAddress(merchant, intentId);
        usdt.mint(deposit, 3e6);
        factory.sweep(merchant, intentId, address(usdt));
        usdt.mint(deposit, 2e6);
        factory.sweep(merchant, intentId, address(usdt));
        assertEq(usdt.balanceOf(merchant), 5e6);
    }

    function test_anyoneCanSweepButOnlyMerchantGetsPaid() public {
        address deposit = factory.computeAddress(merchant, intentId);
        usdt.mint(deposit, 5e6);
        vm.prank(attacker);
        factory.sweep(merchant, intentId, address(usdt));
        assertEq(usdt.balanceOf(merchant), 5e6);
        assertEq(usdt.balanceOf(attacker), 0);
    }

    function test_attackerCannotRedirectBySwappingMerchant() public {
        address deposit = factory.computeAddress(merchant, intentId);
        usdt.mint(deposit, 5e6);
        // Same intentId, attacker as merchant -> a different address, so the deposit stays untouched.
        vm.prank(attacker);
        factory.sweep(attacker, intentId, address(usdt));
        assertEq(usdt.balanceOf(attacker), 0);
        assertEq(usdt.balanceOf(deposit), 5e6);
    }

    function test_distinctAddressesPerIntentAndMerchant() public view {
        assertTrue(factory.computeAddress(merchant, intentId) != factory.computeAddress(merchant, keccak256("pi_2")));
        assertTrue(factory.computeAddress(merchant, intentId) != factory.computeAddress(attacker, intentId));
    }

    function test_tokenWithoutReturnValue() public {
        MockToken noBool = new MockToken(false);
        address deposit = factory.computeAddress(merchant, intentId);
        noBool.mint(deposit, 7e6);
        factory.sweep(merchant, intentId, address(noBool));
        assertEq(noBool.balanceOf(merchant), 7e6);
    }

    function test_sweepEmptyIsNoop() public {
        assertEq(factory.sweep(merchant, intentId, address(usdt)), 0);
    }
}
