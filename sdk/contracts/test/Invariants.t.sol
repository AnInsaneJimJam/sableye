// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {PaymentProcessor} from "../src/PaymentProcessor.sol";
import {IPaymentProcessor} from "../src/IPaymentProcessor.sol";

contract InvToken is ERC20("Tether USD", "USDT") {
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

/// Drives random sequences of pay / refund / cancel / bumpNonce and records ghost state for the invariants.
contract Handler is Test {
    PaymentProcessor public pp;
    InvToken public token;

    uint256 constant MERCHANT_KEY = 0xA11CE;
    address public merchant = vm.addr(MERCHANT_KEY);
    address public payout = makeAddr("payout");
    address[3] public payers = [makeAddr("p0"), makeAddr("p1"), makeAddr("p2")];

    bytes32[] public orderIds;
    mapping(bytes32 => uint8) public lastStatus;
    uint256 public ghostPaid;
    uint256 public ghostRefunded;
    uint256 public doublePaySuccesses;
    uint256 public freshPayAttempts; // pay() on an unpaid, uncancelled invoice with a current nonce
    uint256 public freshPaySuccesses;
    uint256 public illegalTransitions;

    constructor(PaymentProcessor pp_, InvToken token_) {
        pp = pp_;
        token = token_;
        for (uint256 i; i < payers.length; i++) {
            token.mint(payers[i], type(uint128).max);
            vm.prank(payers[i]);
            token.approve(address(pp), type(uint256).max);
        }
        vm.prank(payout);
        token.approve(address(pp), type(uint256).max);
        for (uint256 i; i < 8; i++) orderIds.push(keccak256(abi.encode("order", i)));
    }

    function _invoice(bytes32 orderId, uint256 amount, uint256 nonce) internal view returns (IPaymentProcessor.Invoice memory) {
        return IPaymentProcessor.Invoice(orderId, merchant, payout, address(token), amount, uint64(block.timestamp + 1 days), nonce);
    }

    function _sign(IPaymentProcessor.Invoice memory inv) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(MERCHANT_KEY, pp.hashInvoice(inv));
        return abi.encodePacked(r, s, v);
    }

    function _status(bytes32 id) internal view returns (uint8) {
        return uint8(pp.getReceipt(merchant, id).status);
    }

    /// Checks every invoice's status moved along an allowed edge since the last call.
    function _checkTransitions() internal {
        for (uint256 i; i < orderIds.length; i++) {
            uint8 prev = lastStatus[orderIds[i]];
            uint8 cur = _status(orderIds[i]);
            if (cur != prev) {
                bool ok = (prev == 0 && (cur == 1 || cur == 4)) // None -> Paid | Cancelled
                    || (prev == 1 && (cur == 2 || cur == 3)) // Paid -> Partial | Refunded
                    || (prev == 2 && (cur == 2 || cur == 3)); // Partial -> Partial | Refunded
                if (!ok) illegalTransitions++;
                lastStatus[orderIds[i]] = cur;
            }
        }
    }

    function pay(uint256 orderSeed, uint256 amount, uint256 payerSeed, bool useStaleNonce) external {
        bytes32 id = orderIds[orderSeed % orderIds.length];
        amount = bound(amount, 1, 1e15);
        uint256 nonce = pp.minNonce(merchant);
        if (useStaleNonce && nonce > 0) nonce--;
        IPaymentProcessor.Invoice memory inv = _invoice(id, amount, nonce);
        bytes memory sig = _sign(inv);
        uint8 before = _status(id);
        bool fresh = before == 0 && nonce >= pp.minNonce(merchant);
        if (fresh) freshPayAttempts++;

        vm.prank(payers[payerSeed % payers.length]);
        try pp.pay(inv, sig) {
            if (before != 0) doublePaySuccesses++;
            if (fresh) freshPaySuccesses++;
            ghostPaid += amount;
        } catch {}
        _checkTransitions();
    }

    function refund(uint256 orderSeed, uint256 amount) external {
        bytes32 id = orderIds[orderSeed % orderIds.length];
        IPaymentProcessor.Receipt memory r = pp.getReceipt(merchant, id);
        amount = bound(amount, 0, r.amount + 1); // sometimes over the cap, sometimes zero (both must revert)
        vm.prank(merchant);
        try pp.refund(id, amount) {
            ghostRefunded += amount;
        } catch {}
        _checkTransitions();
    }

    function cancel(uint256 orderSeed) external {
        vm.prank(merchant);
        try pp.cancelInvoice(orderIds[orderSeed % orderIds.length]) {} catch {}
        _checkTransitions();
    }

    function bumpNonce() external {
        vm.prank(merchant);
        pp.bumpNonce();
        _checkTransitions();
    }

    function orderCount() external view returns (uint256) {
        return orderIds.length;
    }
}

contract InvariantsTest is Test {
    PaymentProcessor pp;
    InvToken token;
    Handler handler;

    function setUp() public {
        pp = new PaymentProcessor();
        token = new InvToken();
        handler = new Handler(pp, token);
        targetContract(address(handler));
    }

    /// The processor never holds tokens.
    function invariant_processorHoldsNothing() public view {
        assertEq(token.balanceOf(address(pp)), 0);
    }

    /// Total refunded never exceeds total paid, overall and per invoice.
    function invariant_refundsNeverExceedPayments() public view {
        assertLe(handler.ghostRefunded(), handler.ghostPaid());
        for (uint256 i; i < handler.orderCount(); i++) {
            IPaymentProcessor.Receipt memory r = pp.getReceipt(handler.merchant(), handler.orderIds(i));
            assertLe(r.refunded, r.amount);
        }
    }

    /// An invoice can't be paid twice.
    function invariant_noDoublePay() public view {
        assertEq(handler.doublePaySuccesses(), 0);
    }

    /// Status only moves forward.
    function invariant_statusOnlyMovesForward() public view {
        assertEq(handler.illegalTransitions(), 0);
    }

    /// Guard against a vacuous handler: every valid payment attempt must succeed, so the other invariants
    /// are checked against real money movement rather than a sequence of reverts.
    function afterInvariant() public view {
        assertEq(handler.freshPaySuccesses(), handler.freshPayAttempts(), "valid payments are failing");
    }

    /// Payout received exactly what was paid minus what was refunded.
    function invariant_payoutBalanceMatchesLedger() public view {
        assertEq(token.balanceOf(handler.payout()), handler.ghostPaid() - handler.ghostRefunded());
    }
}
