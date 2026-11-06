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

/// EIP-3009 + permit token for proofs. Accepts any signature (ECDSA is out of scope, as with AcceptAllSigner) but
/// keeps the rules that matter: only `to` may redeem a receive-authorization, each nonce once. Records the nonce
/// so a proof can check what it was bound to. `fee` > 0 turns it into a fee-on-transfer token.
contract HToken3009 is ERC20("Tether USD", "USDT") {
    uint256 public fee;
    address public feeOnlyTo; // 0: every transfer pays the fee; else only transfers to this address
    bool public permitReverts;
    bytes32 public lastNonce;
    mapping(bytes32 => bool) public usedNonce;

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }

    function setFee(uint256 f, address onlyTo) external {
        fee = f;
        feeOnlyTo = onlyTo;
    }

    function setPermitReverts(bool r) external {
        permitReverts = r;
    }

    function permit(address owner, address spender, uint256 value, uint256, uint8, bytes32, bytes32) external {
        require(!permitReverts, "permit used");
        _approve(owner, spender, value);
    }

    function receiveWithAuthorization(address from, address to, uint256 value, uint256, uint256, bytes32 nonce, uint8, bytes32, bytes32)
        external
    {
        require(msg.sender == to, "caller must be payee");
        require(!usedNonce[nonce], "nonce used");
        usedNonce[nonce] = true;
        lastNonce = nonce;
        _transfer(from, to, value);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (fee == 0 || from == address(0) || to == address(0) || (feeOnlyTo != address(0) && to != feeOnlyTo)) {
            return super._update(from, to, value);
        }
        super._update(from, to, value - fee);
        super._update(from, address(0xFEE), fee);
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
    /// The payout may already hold `extra` (so the exact-delta check is exercised), and the receipt records exactly
    /// what happened.
    function check_pay_noCustody_exactAmount(bytes32 orderId, uint256 amount, uint256 extra) public {
        vm.assume(amount <= type(uint128).max && extra <= type(uint128).max);
        _fund(amount);
        token.mint(payout, extra);
        uint256 before = token.balanceOf(payout);
        vm.prank(payer);
        (bool ok,) = address(pp).call(abi.encodeCall(pp.pay, (_inv(orderId, amount, 0), "")));
        assert(ok);
        assert(token.balanceOf(address(pp)) == 0);
        assert(token.balanceOf(payout) == before + amount);
        IPaymentProcessor.Receipt memory r = pp.getReceipt(merchant, orderId);
        assert(r.status == IPaymentProcessor.Status.Paid && r.payer == payer && r.payout == payout && r.token == address(token));
        assert(r.amount == amount && r.refunded == 0 && r.paidAt == block.timestamp && r.paidBlock == block.number);
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
        if (r1 > 0 && r1 <= amount) assert(ok1); // a zero refund reverts (ZeroRefund) by design
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

/// The gasless (EIP-3009) and permit pay paths, and fee-on-transfer tokens on every path.
contract ProcessorPathsHalmos is Test {
    PaymentProcessor pp;
    HToken3009 token;
    address merchant;
    address payout = address(0xBEEF);
    address payer = address(0xCAFE);

    function setUp() public {
        pp = new PaymentProcessor();
        token = new HToken3009();
        merchant = address(new AcceptAllSigner());
    }

    function _inv(bytes32 orderId, uint256 amount) internal view returns (IPaymentProcessor.Invoice memory) {
        return IPaymentProcessor.Invoice(orderId, merchant, payout, address(token), amount, uint64(block.timestamp), 0);
    }

    function _callPath(uint8 path, IPaymentProcessor.Invoice memory inv, address relayer) internal returns (bool ok) {
        if (path % 3 == 0) {
            vm.prank(payer);
            (ok,) = address(pp).call(abi.encodeCall(pp.pay, (inv, "")));
        } else if (path % 3 == 1) {
            vm.prank(payer);
            (ok,) = address(pp).call(abi.encodeCall(pp.payWithPermit, (inv, "", type(uint256).max, 0, 0, 0)));
        } else {
            vm.prank(relayer);
            (ok,) = address(pp).call(abi.encodeCall(pp.payWithAuthorization, (inv, "", payer, 0, type(uint256).max, 0, 0, 0)));
        }
    }

    /// Gasless: any relayer can submit, the payment always succeeds for a funded payer, the processor ends with 0,
    /// the payout gains exactly `amount`, and the authorization's nonce is this invoice's digest (so it can't be
    /// paired with any other invoice).
    /// The processor may hold stray `dust` (someone sent tokens to it) and the payout `extra`: neither is ever touched.
    function check_payWithAuthorization_noCustody_boundNonce(bytes32 orderId, uint256 amount, address relayer, uint256 dust, uint256 extra) public {
        vm.assume(relayer != address(pp) && amount <= type(uint128).max && dust <= type(uint64).max && extra <= type(uint64).max);
        token.mint(payer, amount);
        token.mint(address(pp), dust);
        token.mint(payout, extra);
        IPaymentProcessor.Invoice memory inv = _inv(orderId, amount);
        uint256 before = token.balanceOf(payout);
        assert(_callPath(2, inv, relayer));
        assert(token.balanceOf(address(pp)) == dust);
        assert(token.balanceOf(payout) == before + amount);
        assert(token.lastNonce() == pp.hashInvoice(inv));
        // The same invoice can't be paid twice through this path either.
        token.mint(payer, amount);
        assert(!_callPath(2, inv, relayer));
    }

    /// Permit: succeeds and keeps no custody whether or not the permit was front-run (allowance already set).
    function check_payWithPermit_noCustody(bytes32 orderId, uint256 amount, bool frontRun) public {
        token.mint(payer, amount);
        if (frontRun) {
            vm.prank(payer);
            token.approve(address(pp), amount);
            token.setPermitReverts(true);
        }
        uint256 before = token.balanceOf(payout);
        assert(_callPath(1, _inv(orderId, amount), address(0)));
        assert(token.balanceOf(address(pp)) == 0);
        assert(token.balanceOf(payout) == before + amount);
        assert(pp.getReceipt(merchant, orderId).status == IPaymentProcessor.Status.Paid);
        // the permit path enforces the same checks as pay: no second payment
        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(address(pp), amount);
        assert(!_callPath(1, _inv(orderId, amount), address(0)));
    }

    /// A fee-on-transfer token can never settle an invoice, on any of the three paths, for any fee and amount.
    /// The fee may apply to every transfer, only to transfers into the processor, or only into the payout, and the
    /// processor may hold `dust` that a missing check would let it spend.
    function check_feeOnTransfer_alwaysReverts(bytes32 orderId, uint256 amount, uint256 fee, uint8 path, address relayer, uint8 feeMode, uint256 dust) public {
        vm.assume(fee > 0 && relayer != address(pp) && amount <= type(uint128).max && dust <= type(uint128).max);
        vm.assume(feeMode % 3 != 1 || path % 3 == 2); // a fee only on transfers INTO the processor only hits the gasless path
        token.mint(payer, amount);
        token.mint(address(pp), dust);
        vm.prank(payer);
        token.approve(address(pp), amount);
        token.setFee(fee, feeMode % 3 == 0 ? address(0) : feeMode % 3 == 1 ? address(pp) : payout);
        assert(!_callPath(path, _inv(orderId, amount), relayer));
        assert(pp.getReceipt(merchant, orderId).status == IPaymentProcessor.Status.None);
    }
}

contract SubscriptionsHalmos is Test {
    SubscriptionManager sm;
    HToken3009 token;
    address merchant;
    address payer = address(0xCAFE);
    address payout = address(0xBEEF);

    function setUp() public {
        sm = new SubscriptionManager();
        token = new HToken3009();
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
        // Liveness (a due charge within the cap goes through) is fuzzed: testFuzz_dueChargeWithinCapSucceeds.
        assert(s.charged <= s.cap);
        assert(token.balanceOf(address(sm)) == 0);
    }

    function _subscribe(uint256 amount, uint64 interval, uint256 cap, uint256 balance) internal returns (bytes32 id) {
        token.mint(payer, balance);
        vm.prank(payer);
        token.approve(address(sm), type(uint256).max);
        SubscriptionManager.Plan memory p =
            SubscriptionManager.Plan("plan", merchant, payout, address(token), amount, interval, type(uint64).max);
        vm.prank(payer);
        id = sm.subscribe(p, "", cap);
    }

    function _status(bytes32 id) internal view returns (SubscriptionManager.Status) {
        return sm.getSubscription(id).status;
    }

    /// charge/cancel only make these moves: Active <-> PastDue, either -> Cancelled; Cancelled is terminal for
    /// them (a payer may later re-subscribe, which starts a new cycle by design). The manager never holds tokens,
    /// and a charge that fails moves no funds.
    function check_subStatusMachine(uint256 amount, uint256 balance, uint8 op1, uint8 op2, uint64 t1, uint64 t2) public {
        vm.assume(amount > 0 && amount <= type(uint128).max && balance >= amount && balance <= type(uint128).max);
        bytes32 id = _subscribe(amount, 1 days, type(uint256).max, balance);
        SubscriptionManager.Status s0 = _status(id);
        _subOp(id, op1, t1);
        SubscriptionManager.Status s1 = _status(id);
        _subOp(id, op2, t2);
        SubscriptionManager.Status s2 = _status(id);
        assert(s0 == SubscriptionManager.Status.Active);
        assert(_subForward(s0, s1) && _subForward(s1, s2));
        assert(token.balanceOf(address(sm)) == 0);
        // Value is conserved: charges only ever move `amount` payer -> payout (0xD00D is where a drained payer sent theirs).
        assert(token.balanceOf(payer) + token.balanceOf(payout) + token.balanceOf(address(0xD00D)) == balance);
        assert(token.balanceOf(payout) == sm.getSubscription(id).charged);
    }

    function _subOp(bytes32 id, uint8 op, uint64 dt) internal {
        vm.warp(block.timestamp + dt);
        if (op % 3 == 0) {
            try sm.charge(id) {} catch {}
        } else if (op % 3 == 1) {
            vm.prank(payer);
            try sm.cancel(id) {} catch {}
        } else {
            // the payer drains their wallet, so the next charge fails
            uint256 b = token.balanceOf(payer);
            vm.prank(payer);
            token.transfer(address(0xD00D), b);
        }
    }

    function _subForward(SubscriptionManager.Status a, SubscriptionManager.Status b) internal pure returns (bool) {
        if (a == SubscriptionManager.Status.Cancelled) return b == SubscriptionManager.Status.Cancelled;
        return b != SubscriptionManager.Status.None;
    }

    /// Exactly MAX_FAILED_CHARGES consecutive failures cancel; fewer leave it PastDue; a success in between resets
    /// the counter. Failed charges never move funds and never advance the schedule.
    function check_failedChargesCancelAfterMax(uint256 amount, bool recoverAfterTwo) public {
        vm.assume(amount > 0 && amount <= type(uint128).max);
        bytes32 id = _subscribe(amount, 1 days, type(uint256).max, amount); // only the first cycle is funded
        uint64 due = sm.getSubscription(id).nextChargeAt;
        vm.warp(due);
        uint256 payoutBefore = token.balanceOf(payout);
        for (uint256 i = 1; i <= 2; i++) {
            assert(!sm.charge(id));
            SubscriptionManager.Subscription memory s = sm.getSubscription(id);
            assert(s.status == SubscriptionManager.Status.PastDue && s.failedCharges == i && s.nextChargeAt == due);
        }
        assert(token.balanceOf(payout) == payoutBefore);
        if (recoverAfterTwo) {
            token.mint(payer, amount);
            assert(sm.charge(id));
            SubscriptionManager.Subscription memory s = sm.getSubscription(id);
            assert(s.status == SubscriptionManager.Status.Active && s.failedCharges == 0);
        } else {
            assert(!sm.charge(id));
            assert(_status(id) == SubscriptionManager.Status.Cancelled);
            (bool ok,) = address(sm).call(abi.encodeCall(sm.charge, (id)));
            assert(!ok);
        }
    }

    /// Only the payer or the merchant can cancel.
    function check_onlyPartiesCancel(uint256 amount, address anyone) public {
        vm.assume(amount > 0 && amount <= type(uint128).max && anyone != payer && anyone != merchant);
        bytes32 id = _subscribe(amount, 1 days, type(uint256).max, amount);
        vm.prank(anyone);
        (bool ok,) = address(sm).call(abi.encodeCall(sm.cancel, (id)));
        assert(!ok);
        assert(_status(id) == SubscriptionManager.Status.Active);
    }

    /// A revoked plan can't be subscribed to, by anyone.
    function check_revokedPlanBlocksSubscribe(uint256 amount, address who) public {
        vm.assume(amount > 0 && who != address(sm));
        vm.prank(merchant);
        sm.revokePlan("plan");
        token.mint(who, amount);
        vm.prank(who);
        token.approve(address(sm), amount);
        SubscriptionManager.Plan memory p =
            SubscriptionManager.Plan("plan", merchant, payout, address(token), amount, 1 days, type(uint64).max);
        vm.prank(who);
        (bool ok,) = address(sm).call(abi.encodeCall(sm.subscribe, (p, "", amount)));
        assert(!ok);
    }

    /// Plans with no amount or no interval, and caps below one cycle, are rejected.
    function check_invalidPlanRejected(uint256 amount, uint64 interval, uint256 cap) public {
        vm.assume(amount == 0 || interval == 0 || cap < amount);
        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(address(sm), type(uint256).max);
        SubscriptionManager.Plan memory p = SubscriptionManager.Plan("plan", merchant, payout, address(token), amount, interval, type(uint64).max);
        vm.prank(payer);
        (bool ok,) = address(sm).call(abi.encodeCall(sm.subscribe, (p, "", cap)));
        assert(!ok);
    }

    /// Subscribing always works for a funded payer with a valid plan, and pays exactly the first cycle to the payout
    /// (which may already hold `extra`). With a fee-on-transfer token, subscribing and later charges revert instead.
    function check_subscribeExact_andFeeTokensRejected(uint256 amount, uint256 extra, uint256 fee, bool feeAtCharge) public {
        vm.assume(amount > 0 && amount <= type(uint128).max && extra <= type(uint128).max && fee > 0);
        token.mint(payout, extra);
        token.mint(payer, 2 * amount);
        vm.prank(payer);
        token.approve(address(sm), type(uint256).max);
        SubscriptionManager.Plan memory p = SubscriptionManager.Plan("plan", merchant, payout, address(token), amount, 1 days, type(uint64).max);
        if (!feeAtCharge) token.setFee(fee, payout);
        vm.prank(payer);
        (bool ok,) = address(sm).call(abi.encodeCall(sm.subscribe, (p, "", 2 * amount)));
        if (!feeAtCharge) {
            assert(!ok);
            return;
        }
        assert(ok);
        bytes32 id = sm.subscriptionId(merchant, "plan", payer);
        assert(token.balanceOf(payout) == extra + amount && sm.getSubscription(id).charged == amount);
        token.setFee(fee, payout);
        vm.warp(block.timestamp + 1 days);
        // Reverts (fee below the amount) or records a failed charge (fee above it): never a charge that underpays.
        (bool ok2,) = address(sm).call(abi.encodeCall(sm.charge, (id)));
        ok2;
        assert(sm.getSubscription(id).charged == amount);
        assert(token.balanceOf(payout) == extra + amount);
    }

    /// The payer or the merchant can cancel an active subscription, exactly once.
    function check_partiesCanCancelOnce(uint256 amount, bool byMerchant) public {
        vm.assume(amount > 0 && amount <= type(uint128).max);
        bytes32 id = _subscribe(amount, 1 days, type(uint256).max, amount);
        vm.prank(byMerchant ? merchant : payer);
        (bool ok,) = address(sm).call(abi.encodeCall(sm.cancel, (id)));
        assert(ok && _status(id) == SubscriptionManager.Status.Cancelled);
        vm.prank(byMerchant ? merchant : payer);
        (bool again,) = address(sm).call(abi.encodeCall(sm.cancel, (id)));
        assert(!again);
    }
}
