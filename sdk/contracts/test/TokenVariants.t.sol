// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {PaymentProcessor} from "../src/PaymentProcessor.sol";
import {IPaymentProcessor} from "../src/IPaymentProcessor.sol";

/// Mainnet-USDT-style token: transfer / transferFrom / approve return nothing.
contract NoBoolToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amt) external {
        balanceOf[to] += amt;
    }

    function approve(address spender, uint256 amt) external {
        allowance[msg.sender][spender] = amt;
    }

    function transfer(address to, uint256 amt) external {
        balanceOf[msg.sender] -= amt;
        balanceOf[to] += amt;
    }

    function transferFrom(address from, address to, uint256 amt) external {
        allowance[from][msg.sender] -= amt;
        balanceOf[from] -= amt;
        balanceOf[to] += amt;
    }
}

/// Issuer-style blacklist (USDT/USDC can freeze addresses).
contract BlacklistToken is ERC20("Blacklist", "BL") {
    mapping(address => bool) public blacklisted;

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }

    function setBlacklisted(address a, bool b) external {
        blacklisted[a] = b;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!blacklisted[from] && !blacklisted[to], "blacklisted");
        super._update(from, to, value);
    }
}

contract TokenVariantsTest is Test {
    PaymentProcessor pp = new PaymentProcessor();
    uint256 merchantKey = 0xA11CE;
    address merchant = vm.addr(merchantKey);
    address payout = makeAddr("payout");
    address payer = makeAddr("payer");

    function _invoice(address token, uint256 amount) internal view returns (IPaymentProcessor.Invoice memory) {
        return IPaymentProcessor.Invoice("o1", merchant, payout, token, amount, uint64(block.timestamp + 1 hours), 0);
    }

    function _sign(IPaymentProcessor.Invoice memory inv) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(merchantKey, pp.hashInvoice(inv));
        return abi.encodePacked(r, s, v);
    }

    function test_noBoolToken_payAndRefund() public {
        NoBoolToken t = new NoBoolToken();
        t.mint(payer, 10e6);
        vm.prank(payer);
        t.approve(address(pp), type(uint256).max);
        vm.prank(payout);
        t.approve(address(pp), type(uint256).max);

        IPaymentProcessor.Invoice memory inv = _invoice(address(t), 5e6);
        bytes memory sig = _sign(inv);
        vm.prank(payer);
        pp.pay(inv, sig);
        assertEq(t.balanceOf(payout), 5e6);

        vm.prank(merchant);
        pp.refund("o1", 5e6);
        assertEq(t.balanceOf(payer), 10e6);
    }

    function test_blacklistedPayer_revertsAndInvoiceStaysPayable() public {
        BlacklistToken t = new BlacklistToken();
        t.mint(payer, 10e6);
        vm.prank(payer);
        t.approve(address(pp), type(uint256).max);
        t.setBlacklisted(payer, true);

        IPaymentProcessor.Invoice memory inv = _invoice(address(t), 5e6);
        bytes memory sig = _sign(inv);
        vm.prank(payer);
        vm.expectRevert("blacklisted");
        pp.pay(inv, sig);
        // The whole tx reverted, so nothing was recorded and the invoice can still be paid later.
        assertEq(uint8(pp.getReceipt(merchant, "o1").status), uint8(IPaymentProcessor.Status.None));

        t.setBlacklisted(payer, false);
        vm.prank(payer);
        pp.pay(inv, sig);
        assertEq(t.balanceOf(payout), 5e6);
    }

    function test_blacklistedPayout_reverts() public {
        BlacklistToken t = new BlacklistToken();
        t.mint(payer, 10e6);
        vm.prank(payer);
        t.approve(address(pp), type(uint256).max);
        t.setBlacklisted(payout, true);

        IPaymentProcessor.Invoice memory inv = _invoice(address(t), 5e6);
        bytes memory sig = _sign(inv);
        vm.prank(payer);
        vm.expectRevert("blacklisted");
        pp.pay(inv, sig);
        assertEq(t.balanceOf(payer), 10e6);
    }
}
