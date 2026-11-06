// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

/// @title Sableye SubscriptionManager
/// @notice Recurring USDT payments. The merchant signs a plan (EIP-712, EOA or ERC-1271); the customer subscribes
/// with a spending cap and an ERC-20 allowance. Anyone (usually the merchant's keeper) may call `charge` once per
/// interval. Funds go payer -> payout directly; this contract never holds tokens.
contract SubscriptionManager is EIP712, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    /// @dev EIP-712 type: Plan(bytes32 planId,address merchant,address payout,address token,uint256 amount,uint64 interval,uint64 expiry)
    struct Plan {
        bytes32 planId; // merchant-chosen id
        address merchant; // signer
        address payout; // receives every charge
        address token;
        uint256 amount; // per cycle, token base units
        uint64 interval; // seconds between charges
        uint64 expiry; // last moment a NEW subscription to this offer can start
    }

    enum Status {
        None,
        Active,
        PastDue,
        Cancelled
    }

    struct Subscription {
        Status status;
        uint8 failedCharges; // consecutive failures; reset by a successful charge
        address payer;
        address merchant;
        address payout;
        address token;
        uint256 amount;
        uint64 interval;
        uint64 startedAt;
        uint64 nextChargeAt;
        uint256 cap; // max total the payer authorized across all cycles
        uint256 charged; // total charged so far
    }

    bytes32 public constant PLAN_TYPEHASH = keccak256(
        "Plan(bytes32 planId,address merchant,address payout,address token,uint256 amount,uint64 interval,uint64 expiry)"
    );
    /// After this many consecutive failed charges the subscription is cancelled.
    uint8 public constant MAX_FAILED_CHARGES = 3;

    mapping(bytes32 subId => Subscription) private _subs;
    mapping(address merchant => mapping(bytes32 planId => bool)) public planRevoked;

    event Subscribed(bytes32 indexed subId, address indexed merchant, address indexed payer, bytes32 planId, uint256 amount, uint64 interval, uint256 cap);
    event Charged(bytes32 indexed subId, address indexed merchant, address indexed payer, uint256 amount, uint256 totalCharged, uint64 nextChargeAt);
    event ChargeFailed(bytes32 indexed subId, address indexed merchant, address indexed payer, uint8 failedCharges);
    event SubscriptionCancelled(bytes32 indexed subId, address indexed merchant, address indexed by);
    event PlanRevoked(address indexed merchant, bytes32 indexed planId);

    error InvalidSignature();
    error PlanExpired();
    error PlanIsRevoked();
    error AlreadySubscribed();
    error InvalidPlan();
    error CapTooLow();
    error NotDue(uint64 nextChargeAt);
    error CapReached();
    error NotActive(Status status);
    error NotAuthorized();
    error FeeOnTransferNotSupported();

    constructor() EIP712("Sableye Subscriptions", "1") {}

    /// @notice Id of `payer`'s subscription to a plan (one per payer per plan).
    function subscriptionId(address merchant, bytes32 planId, address payer) public pure returns (bytes32) {
        return keccak256(abi.encode(merchant, planId, payer));
    }

    function hashPlan(Plan calldata p) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(abi.encode(PLAN_TYPEHASH, p.planId, p.merchant, p.payout, p.token, p.amount, p.interval, p.expiry))
        );
    }

    function getSubscription(bytes32 subId) external view returns (Subscription memory) {
        return _subs[subId];
    }

    /// @notice Subscribe to a merchant-signed plan and pay the first cycle now. Caller is the payer and must have
    /// approved at least `cap` of `plan.token` to this contract. `cap` bounds the total ever charged.
    function subscribe(Plan calldata plan, bytes calldata merchantSig, uint256 cap) external nonReentrant returns (bytes32 subId) {
        if (plan.amount == 0 || plan.interval == 0) revert InvalidPlan();
        // slither-disable-next-line timestamp -- offer expiry is wall-clock by design
        if (block.timestamp > plan.expiry) revert PlanExpired();
        if (planRevoked[plan.merchant][plan.planId]) revert PlanIsRevoked();
        if (cap < plan.amount) revert CapTooLow();
        if (!SignatureChecker.isValidSignatureNow(plan.merchant, hashPlan(plan), merchantSig)) revert InvalidSignature();

        subId = subscriptionId(plan.merchant, plan.planId, msg.sender);
        Subscription storage s = _subs[subId];
        if (s.status == Status.Active || s.status == Status.PastDue) revert AlreadySubscribed();

        uint64 now_ = uint64(block.timestamp);
        _subs[subId] = Subscription({
            status: Status.Active,
            failedCharges: 0,
            payer: msg.sender,
            merchant: plan.merchant,
            payout: plan.payout,
            token: plan.token,
            amount: plan.amount,
            interval: plan.interval,
            startedAt: now_,
            nextChargeAt: now_ + plan.interval,
            cap: cap,
            charged: plan.amount
        });
        emit Subscribed(subId, plan.merchant, msg.sender, plan.planId, plan.amount, plan.interval, cap);

        // First cycle is paid on subscribe and must succeed.
        IERC20 token = IERC20(plan.token);
        uint256 before = token.balanceOf(plan.payout);
        token.safeTransferFrom(msg.sender, plan.payout, plan.amount);
        if (token.balanceOf(plan.payout) - before != plan.amount) revert FeeOnTransferNotSupported();
        emit Charged(subId, plan.merchant, msg.sender, plan.amount, plan.amount, now_ + plan.interval);
    }

    /// @notice Charge one due cycle. Anyone may call (the merchant's keeper usually does); funds can only go to the
    /// subscription's payout. A failed transfer doesn't revert: it marks the subscription PastDue so it can be
    /// retried, and cancels it after MAX_FAILED_CHARGES consecutive failures.
    /// @return ok whether the charge went through
    function charge(bytes32 subId) external nonReentrant returns (bool ok) {
        Subscription storage s = _subs[subId];
        if (s.status != Status.Active && s.status != Status.PastDue) revert NotActive(s.status);
        // slither-disable-next-line timestamp -- billing interval is wall-clock by design
        if (block.timestamp < s.nextChargeAt) revert NotDue(s.nextChargeAt);
        if (s.charged + s.amount > s.cap) revert CapReached();

        IERC20 token = IERC20(s.token);
        uint256 before = token.balanceOf(s.payout);
        // slither-disable-next-line arbitrary-send-erc20 -- payer authorized this subscription (cap + allowance) when subscribing
        ok = token.trySafeTransferFrom(s.payer, s.payout, s.amount);
        if (ok && token.balanceOf(s.payout) - before != s.amount) revert FeeOnTransferNotSupported();

        if (ok) {
            s.charged += s.amount;
            s.nextChargeAt += s.interval; // keep the schedule: one cycle per interval, never more
            s.failedCharges = 0;
            s.status = Status.Active;
            emit Charged(subId, s.merchant, s.payer, s.amount, s.charged, s.nextChargeAt);
        } else {
            s.failedCharges++;
            emit ChargeFailed(subId, s.merchant, s.payer, s.failedCharges);
            if (s.failedCharges >= MAX_FAILED_CHARGES) {
                s.status = Status.Cancelled;
                emit SubscriptionCancelled(subId, s.merchant, address(this));
            } else {
                s.status = Status.PastDue;
            }
        }
    }

    /// @notice Cancel on-chain. The payer or the merchant may cancel; no further charges are possible.
    function cancel(bytes32 subId) external {
        Subscription storage s = _subs[subId];
        if (msg.sender != s.payer && msg.sender != s.merchant) revert NotAuthorized();
        if (s.status != Status.Active && s.status != Status.PastDue) revert NotActive(s.status);
        s.status = Status.Cancelled;
        emit SubscriptionCancelled(subId, s.merchant, msg.sender);
    }

    /// @notice Stop new subscriptions to a plan offer. Existing subscriptions are unaffected.
    function revokePlan(bytes32 planId) external {
        planRevoked[msg.sender][planId] = true;
        emit PlanRevoked(msg.sender, planId);
    }
}
