// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Symbolic proofs (Halmos 0.3.3, pinned). Run: halmos --match-contract Halmos
// Each check_ function is proved for ALL values of its parameters (within Halmos' loop/length bounds).
// Scope: the merchant is an ERC-1271 contract that accepts any signature, because ECDSA can't be reasoned about
// symbolically. Signature checking itself is covered by unit + fuzz tests; these proofs cover the accounting.
import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {PaymentProcessor} from "../../src/PaymentProcessor.sol";
import {IPaymentProcessor} from "../../src/IPaymentProcessor.sol";
import {SubscriptionManager} from "../../src/SubscriptionManager.sol";

contract HToken is ERC20("Tether USD", "USDT") {
    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract AcceptAllSigner is IERC1271 {
    function isValidSignature(bytes32, bytes calldata) external pure returns (bytes4) {
        return IERC1271.isValidSignature.selector;
    }
}

contract ProcessorHalmos is Test {
    PaymentProcessor pp;
    HToken token;
    address merchant;
    address payout = address(0xBEEF);
    address payer = address(0xCAFE);

    function setUp() public {
        pp = new PaymentProcessor();
        token = new HToken();
        merchant = address(new AcceptAllSigner());
        vm.prank(payout);
        token.approve(address(pp), type(uint256).max); // enables refunds
    }

    function _inv(bytes32 orderId, uint256 amount, uint256 nonce) internal view returns (IPaymentProcessor.Invoice memory) {
        return IPaymentProcessor.Invoice(orderId, merchant, payout, address(token), amount, uint64(block.timestamp), nonce);
    }

    function _fund(uint256 amount) internal {
        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(address(pp), amount);
    }

    function _pay(IPaymentProcessor.Invoice memory inv) internal {
        vm.prank(payer);
        pp.pay(inv, "");
    }

    /// P1 + P6 + liveness: a funded payer's valid payment ALWAYS succeeds, the processor holds nothing,
    /// and the payout received exactly `amount`. (Asserting success keeps the proof from passing vacuously.)
    function check_pay_noCustody_exactAmount(bytes32 orderId, uint256 amount) public {
        _fund(amount);
        uint256 before = token.balanceOf(payout);
        vm.prank(payer);
        (bool ok,) = address(pp).call(abi.encodeCall(pp.pay, (_inv(orderId, amount, 0), "")));
        assert(ok);
        assert(token.balanceOf(address(pp)) == 0);
        assert(token.balanceOf(payout) == before + amount);
    }

    /// P2: a paid invoice can never be paid again, by anyone, for any amount of allowance.
    function check_noDoublePay(bytes32 orderId, uint256 amount, address anyone) public {
        _fund(amount);
        IPaymentProcessor.Invoice memory inv = _inv(orderId, amount, 0);
        _pay(inv);
        token.mint(anyone, amount);
        vm.prank(anyone);
        token.approve(address(pp), amount);
        vm.prank(anyone);
        (bool ok,) = address(pp).call(abi.encodeCall(pp.pay, (inv, "")));
        assert(!ok);
    }

    /// P3 + P1: any two refunds of any size never exceed what was paid, and the processor still holds nothing.
    /// The payout holds `extra` beyond the payment, so only the contract's cap (not the token balance) can stop an
    /// over-refund. Liveness: a refund within the remaining amount always succeeds. Status always matches `refunded`.
    function check_refundsCapped(bytes32 orderId, uint256 amount, uint256 extra, uint256 r1, uint256 r2) public {
        vm.assume(amount <= type(uint128).max && extra <= type(uint128).max);
        _fund(amount);
        token.mint(payout, extra);
        _pay(_inv(orderId, amount, 0));

        vm.prank(merchant);
        (bool ok1,) = address(pp).call(abi.encodeCall(pp.refund, (orderId, r1)));
        if (r1 <= amount) assert(ok1);
        vm.prank(merchant);
        (bool ok2,) = address(pp).call(abi.encodeCall(pp.refund, (orderId, r2)));

        IPaymentProcessor.Receipt memory r = pp.getReceipt(merchant, orderId);
        assert(r.refunded <= r.amount);
        assert(token.balanceOf(address(pp)) == 0);
        if (ok1 && ok2) assert(r.refunded == r1 + r2);
        // Status is a pure function of refunded vs amount.
        if (r.refunded == 0) assert(r.status == IPaymentProcessor.Status.Paid || amount == 0);
        else if (r.refunded < r.amount) assert(r.status == IPaymentProcessor.Status.PartiallyRefunded);
        else assert(r.status == IPaymentProcessor.Status.Refunded);
    }

    /// P4: status only moves forward, for any sequence of two operations with any arguments.
    function check_statusOnlyForward(bytes32 orderId, uint256 amount, uint8 op1, uint8 op2, uint256 x, uint256 y) public {
        _fund(amount);
        uint8 s0 = uint8(pp.getReceipt(merchant, orderId).status);
        _op(op1, orderId, amount, x);
        uint8 s1 = uint8(pp.getReceipt(merchant, orderId).status);
        _op(op2, orderId, amount, y);
        uint8 s2 = uint8(pp.getReceipt(merchant, orderId).status);
        assert(_forward(s0, s1));
        assert(_forward(s1, s2));
    }

    function _op(uint8 op, bytes32 orderId, uint256 amount, uint256 arg) internal {
        if (op % 3 == 0) {
            vm.prank(payer);
            try pp.pay(_inv(orderId, amount, 0), "") {} catch {}
        } else if (op % 3 == 1) {
            vm.prank(merchant);
            try pp.refund(orderId, arg) {} catch {}
        } else {
            vm.prank(merchant);
            try pp.cancelInvoice(orderId) {} catch {}
        }
    }

    /// None(0) -> Paid(1) | Cancelled(4); Paid -> Partial(2) | Refunded(3); Partial -> Partial | Refunded.
    function _forward(uint8 a, uint8 b) internal pure returns (bool) {
        if (a == b) return true;
        if (a == 0) return b == 1 || b == 4;
        if (a == 1) return b == 2 || b == 3;
        if (a == 2) return b == 3;
        return false; // Refunded and Cancelled are terminal
    }

    /// P7: after bumpNonce, no invoice signed with an older nonce can be paid.
    function check_bumpNonceRevokes(bytes32 orderId, uint256 amount, uint256 nonce) public {
        _fund(amount);
        vm.prank(merchant);
        uint256 minNonce = pp.bumpNonce();
        vm.assume(nonce < minNonce);
        vm.prank(payer);
        (bool ok,) = address(pp).call(abi.encodeCall(pp.pay, (_inv(orderId, amount, nonce), "")));
        assert(!ok);
    }

    /// A cancelled invoice can never be paid.
    function check_cancelBlocksPay(bytes32 orderId, uint256 amount) public {
        _fund(amount);
        vm.prank(merchant);
        pp.cancelInvoice(orderId);
        vm.prank(payer);
        (bool ok,) = address(pp).call(abi.encodeCall(pp.pay, (_inv(orderId, amount, 0), "")));
        assert(!ok);
    }
}

contract SubscriptionsHalmos is Test {
    SubscriptionManager sm;
    HToken token;
    address merchant;
    address payer = address(0xCAFE);

    function setUp() public {
        sm = new SubscriptionManager();
        token = new HToken();
        merchant = address(new AcceptAllSigner());
    }

    /// No charge before the interval ends, and never above the cap, for any plan, cap and time.
    function check_chargeRespectsIntervalAndCap(uint256 amount, uint64 interval, uint256 cap, uint64 elapsed) public {
        vm.assume(amount > 0 && interval > 0 && cap >= amount && cap <= type(uint128).max && amount <= type(uint128).max);
        token.mint(payer, cap);
        vm.prank(payer);
        token.approve(address(sm), cap);
        SubscriptionManager.Plan memory p =
            SubscriptionManager.Plan("plan", merchant, address(0xBEEF), address(token), amount, interval, type(uint64).max);
        vm.prank(payer);
        bytes32 id = sm.subscribe(p, "", cap);
        uint256 start = block.timestamp;

        vm.warp(start + elapsed);
        (bool ok,) = address(sm).call(abi.encodeCall(sm.charge, (id)));
        SubscriptionManager.Subscription memory s = sm.getSubscription(id);
        if (elapsed < interval) assert(!ok); // too early: always reverts
        assert(s.charged <= s.cap);
        assert(token.balanceOf(address(sm)) == 0);
    }
}
