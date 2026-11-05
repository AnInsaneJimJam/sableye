// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {PaymentProcessor} from "../src/PaymentProcessor.sol";
import {IPaymentProcessor} from "../src/IPaymentProcessor.sol";

contract MockUSDT is ERC20("Tether USD", "USDT") {
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract FeeToken is ERC20("Fee", "FEE") {
    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            super._update(from, address(0xdead), value / 100); // 1% fee
            value -= value / 100;
        }
        super._update(from, to, value);
    }
}

/// Smart-wallet merchant: accepts signatures from its owner key (ERC-1271).
contract MockSafe is IERC1271 {
    address public owner;

    constructor(address owner_) {
        owner = owner_;
    }

    function isValidSignature(bytes32 hash, bytes calldata sig) external view returns (bytes4) {
        return ECDSA.recover(hash, sig) == owner ? IERC1271.isValidSignature.selector : bytes4(0);
    }
}

contract PaymentProcessorTest is Test {
    PaymentProcessor pp;
    MockUSDT usdt;
    uint256 merchantKey = 0xA11CE;
    address merchant = vm.addr(merchantKey);
    address payout = makeAddr("payout");
    address payer = makeAddr("payer");

    function setUp() public {
        pp = new PaymentProcessor();
        usdt = new MockUSDT();
        usdt.mint(payer, 1_000_000e6);
        vm.prank(payer);
        usdt.approve(address(pp), type(uint256).max);
        vm.prank(payout);
        usdt.approve(address(pp), type(uint256).max); // for refunds
    }

    function _invoice(bytes32 orderId, uint256 amount) internal view returns (IPaymentProcessor.Invoice memory) {
        return IPaymentProcessor.Invoice(orderId, merchant, payout, address(usdt), amount, uint64(block.timestamp + 1 hours), 0);
    }

    function _sign(uint256 key, IPaymentProcessor.Invoice memory inv) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, pp.hashInvoice(inv));
        return abi.encodePacked(r, s, v);
    }

    function _pay(IPaymentProcessor.Invoice memory inv, bytes memory sig) internal {
        vm.prank(payer);
        pp.pay(inv, sig);
    }

    // ---------- pay ----------

    function test_pay() public {
        IPaymentProcessor.Invoice memory inv = _invoice("order-1", 5e6);
        vm.expectEmit(address(pp));
        emit IPaymentProcessor.InvoicePaid(merchant, "order-1", payer, address(usdt), 5e6, payout);
        _pay(inv, _sign(merchantKey, inv));

        assertEq(usdt.balanceOf(payout), 5e6);
        assertEq(usdt.balanceOf(address(pp)), 0);
        IPaymentProcessor.Receipt memory r = pp.getReceipt(merchant, "order-1");
        assertEq(uint8(r.status), uint8(IPaymentProcessor.Status.Paid));
        assertEq(r.payer, payer);
        assertEq(r.amount, 5e6);
        assertEq(r.paidBlock, block.number);
    }

    function test_revert_doublePay() public {
        IPaymentProcessor.Invoice memory inv = _invoice("order-1", 5e6);
        bytes memory sig = _sign(merchantKey, inv);
        _pay(inv, sig);
        vm.expectRevert(abi.encodeWithSelector(IPaymentProcessor.InvalidStatus.selector, IPaymentProcessor.Status.Paid));
        _pay(inv, sig);
    }

    function test_revert_expired() public {
        IPaymentProcessor.Invoice memory inv = _invoice("order-1", 5e6);
        bytes memory sig = _sign(merchantKey, inv);
        vm.warp(inv.expiry + 1);
        vm.expectRevert(IPaymentProcessor.InvoiceExpired.selector);
        _pay(inv, sig);
    }

    function test_revert_wrongSigner() public {
        IPaymentProcessor.Invoice memory inv = _invoice("order-1", 5e6);
        bytes memory sig = _sign(0xBAD, inv);
        vm.expectRevert(IPaymentProcessor.InvalidSignature.selector);
        _pay(inv, sig);
    }

    function test_revert_tamperedFields() public {
        IPaymentProcessor.Invoice memory inv = _invoice("order-1", 5e6);
        bytes memory sig = _sign(merchantKey, inv);

        IPaymentProcessor.Invoice memory t = inv;
        t.amount = 1;
        vm.expectRevert(IPaymentProcessor.InvalidSignature.selector);
        _pay(t, sig);

        t = _invoice("order-1", 5e6);
        t.payout = payer;
        vm.expectRevert(IPaymentProcessor.InvalidSignature.selector);
        _pay(t, sig);
    }

    function test_erc1271Merchant() public {
        MockSafe safe = new MockSafe(merchant);
        IPaymentProcessor.Invoice memory inv = _invoice("order-1", 5e6);
        inv.merchant = address(safe);
        _pay(inv, _sign(merchantKey, inv));
        assertEq(usdt.balanceOf(payout), 5e6);
    }

    function test_revert_feeOnTransfer() public {
        FeeToken fee = new FeeToken();
        fee.mint(payer, 100e18);
        vm.prank(payer);
        fee.approve(address(pp), type(uint256).max);
        IPaymentProcessor.Invoice memory inv = _invoice("order-1", 10e18);
        inv.token = address(fee);
        bytes memory sig = _sign(merchantKey, inv);
        vm.expectRevert(IPaymentProcessor.FeeOnTransferNotSupported.selector);
        _pay(inv, sig);
    }

    // ---------- revocation ----------

    function test_cancelInvoice() public {
        IPaymentProcessor.Invoice memory inv = _invoice("order-1", 5e6);
        vm.prank(merchant);
        pp.cancelInvoice("order-1");
        bytes memory sig = _sign(merchantKey, inv);
        vm.expectRevert(abi.encodeWithSelector(IPaymentProcessor.InvalidStatus.selector, IPaymentProcessor.Status.Cancelled));
        _pay(inv, sig);
    }

    function test_revert_cancelPaid() public {
        IPaymentProcessor.Invoice memory inv = _invoice("order-1", 5e6);
        _pay(inv, _sign(merchantKey, inv));
        vm.prank(merchant);
        vm.expectRevert(abi.encodeWithSelector(IPaymentProcessor.InvalidStatus.selector, IPaymentProcessor.Status.Paid));
        pp.cancelInvoice("order-1");
    }

    function test_bumpNonceRevokesOldInvoices() public {
        IPaymentProcessor.Invoice memory inv = _invoice("order-1", 5e6);
        bytes memory sig = _sign(merchantKey, inv);
        vm.prank(merchant);
        assertEq(pp.bumpNonce(), 1);
        vm.expectRevert(IPaymentProcessor.InvoiceRevoked.selector);
        _pay(inv, sig);

        inv.nonce = 1;
        _pay(inv, _sign(merchantKey, inv));
    }

    // ---------- refund ----------

    function test_partialThenFullRefund() public {
        IPaymentProcessor.Invoice memory inv = _invoice("order-1", 5e6);
        _pay(inv, _sign(merchantKey, inv));

        vm.prank(merchant);
        pp.refund("order-1", 2e6);
        assertEq(uint8(pp.getReceipt(merchant, "order-1").status), uint8(IPaymentProcessor.Status.PartiallyRefunded));

        vm.prank(merchant);
        pp.refund("order-1", 3e6);
        assertEq(uint8(pp.getReceipt(merchant, "order-1").status), uint8(IPaymentProcessor.Status.Refunded));
        assertEq(usdt.balanceOf(payer), 1_000_000e6);
        assertEq(usdt.balanceOf(address(pp)), 0);
    }

    function test_revert_refundOverCap() public {
        IPaymentProcessor.Invoice memory inv = _invoice("order-1", 5e6);
        _pay(inv, _sign(merchantKey, inv));
        vm.prank(merchant);
        vm.expectRevert(IPaymentProcessor.RefundExceedsPaid.selector);
        pp.refund("order-1", 5e6 + 1);
    }

    function test_revert_refundByNonMerchant() public {
        IPaymentProcessor.Invoice memory inv = _invoice("order-1", 5e6);
        _pay(inv, _sign(merchantKey, inv));
        vm.prank(payer); // looks up payer's own (empty) receipt
        vm.expectRevert(abi.encodeWithSelector(IPaymentProcessor.InvalidStatus.selector, IPaymentProcessor.Status.None));
        pp.refund("order-1", 1);
    }

    // ---------- fuzz ----------

    function testFuzz_payAmount(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000e6);
        IPaymentProcessor.Invoice memory inv = _invoice("fuzz", amount);
        _pay(inv, _sign(merchantKey, inv));
        assertEq(usdt.balanceOf(payout), amount);
        assertEq(usdt.balanceOf(address(pp)), 0);
    }

    function testFuzz_expiry(uint64 expiry, uint64 nowTs) public {
        nowTs = uint64(bound(nowTs, 1, type(uint64).max - 1));
        vm.warp(nowTs);
        IPaymentProcessor.Invoice memory inv = _invoice("fuzz", 1e6);
        inv.expiry = expiry;
        bytes memory sig = _sign(merchantKey, inv);
        if (nowTs > expiry) vm.expectRevert(IPaymentProcessor.InvoiceExpired.selector);
        _pay(inv, sig);
    }

    function testFuzz_onlyMerchantKeyWorks(uint256 key) public {
        key = bound(key, 1, 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140);
        IPaymentProcessor.Invoice memory inv = _invoice("fuzz", 1e6);
        bytes memory sig = _sign(key, inv);
        if (key != merchantKey) vm.expectRevert(IPaymentProcessor.InvalidSignature.selector);
        _pay(inv, sig);
    }

    function testFuzz_refundCapped(uint256 paid, uint256 a, uint256 b) public {
        paid = bound(paid, 1, 1_000_000e6);
        IPaymentProcessor.Invoice memory inv = _invoice("fuzz", paid);
        _pay(inv, _sign(merchantKey, inv));
        a = bound(a, 0, paid);
        vm.prank(merchant);
        pp.refund("fuzz", a);
        b = bound(b, 0, 2 * paid);
        vm.prank(merchant);
        if (a == paid) {
            vm.expectRevert(abi.encodeWithSelector(IPaymentProcessor.InvalidStatus.selector, IPaymentProcessor.Status.Refunded));
        } else if (a + b > paid) {
            vm.expectRevert(IPaymentProcessor.RefundExceedsPaid.selector);
        }
        pp.refund("fuzz", b);
        assertLe(pp.getReceipt(merchant, "fuzz").refunded, paid);
    }
}
