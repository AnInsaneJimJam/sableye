// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IERC3009, IPaymentProcessor} from "./IPaymentProcessor.sol";

/// @title Sableye PaymentProcessor
/// @notice Non-custodial: every transfer goes payer -> payout (or payout -> payer for refunds) directly.
contract PaymentProcessor is IPaymentProcessor, EIP712, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    bytes32 public constant INVOICE_TYPEHASH = keccak256(
        "Invoice(bytes32 orderId,address merchant,address payout,address token,uint256 amount,uint64 expiry,uint256 nonce)"
    );

    mapping(address merchant => uint256) public minNonce;
    // slither-disable-next-line uninitialized-state -- written through the storage pointer in _accept
    mapping(address merchant => mapping(bytes32 orderId => Receipt)) private _receipts;

    constructor() EIP712("Sableye", "1") {}

    /// @inheritdoc IPaymentProcessor
    function pay(Invoice calldata inv, bytes calldata merchantSig) external nonReentrant {
        _accept(inv, merchantSig, msg.sender);
        _pull(inv);
    }

    /// @inheritdoc IPaymentProcessor
    function payWithPermit(Invoice calldata inv, bytes calldata merchantSig, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
        nonReentrant
    {
        _accept(inv, merchantSig, msg.sender);
        // try/catch: a front-run permit (griefing) leaves the allowance in place, so the payment still goes through.
        try IERC20Permit(inv.token).permit(msg.sender, address(this), inv.amount, deadline, v, r, s) {} catch {}
        _pull(inv);
    }

    /// @inheritdoc IPaymentProcessor
    function payWithAuthorization(
        Invoice calldata inv,
        bytes calldata merchantSig,
        address payer,
        uint256 validAfter,
        uint256 validBefore,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        _accept(inv, merchantSig, payer);
        // The EIP-3009 nonce IS the invoice digest, so a relayer can't pair the payer's authorization with another invoice.
        // receiveWithAuthorization (not transferWith...) can only be redeemed by this contract, so it can't be front-run.
        IERC20 token = IERC20(inv.token);
        uint256 before = token.balanceOf(address(this));
        IERC3009(inv.token).receiveWithAuthorization(payer, address(this), inv.amount, validAfter, validBefore, hashInvoice(inv), v, r, s);
        if (token.balanceOf(address(this)) - before != inv.amount) revert FeeOnTransferNotSupported();
        _push(inv, token);
        emit InvoicePaid(inv.merchant, inv.orderId, payer, inv.token, inv.amount, inv.payout);
    }

    /// Checks + effects shared by every pay path.
    function _accept(Invoice calldata inv, bytes calldata merchantSig, address payer) private {
        Receipt storage rc = _receipts[inv.merchant][inv.orderId];
        if (rc.status != Status.None) revert InvalidStatus(rc.status);
        // slither-disable-next-line timestamp -- expiry is wall-clock by design; seconds of drift are irrelevant
        if (block.timestamp > inv.expiry) revert InvoiceExpired();
        if (inv.nonce < minNonce[inv.merchant]) revert InvoiceRevoked();
        if (!SignatureChecker.isValidSignatureNow(inv.merchant, hashInvoice(inv), merchantSig)) revert InvalidSignature();

        rc.status = Status.Paid;
        rc.payer = payer;
        rc.payout = inv.payout;
        rc.token = inv.token;
        rc.amount = inv.amount;
        rc.paidAt = uint64(block.timestamp);
        rc.paidBlock = uint64(block.number);
    }

    /// msg.sender (the payer) -> payout directly; the processor never touches the funds.
    function _pull(Invoice calldata inv) private {
        IERC20 token = IERC20(inv.token);
        uint256 before = token.balanceOf(inv.payout);
        token.safeTransferFrom(msg.sender, inv.payout, inv.amount);
        if (token.balanceOf(inv.payout) - before != inv.amount) revert FeeOnTransferNotSupported();
        emit InvoicePaid(inv.merchant, inv.orderId, msg.sender, inv.token, inv.amount, inv.payout);
    }

    /// Forward funds received via EIP-3009 to payout in the same transaction (net processor balance stays 0).
    function _push(Invoice calldata inv, IERC20 token) private {
        uint256 before = token.balanceOf(inv.payout);
        token.safeTransfer(inv.payout, inv.amount);
        if (token.balanceOf(inv.payout) - before != inv.amount) revert FeeOnTransferNotSupported();
    }

    /// @inheritdoc IPaymentProcessor
    function refund(bytes32 orderId, uint256 amount) external nonReentrant {
        Receipt storage r = _receipts[msg.sender][orderId];
        if (r.status != Status.Paid && r.status != Status.PartiallyRefunded) revert InvalidStatus(r.status);
        uint256 total = r.refunded + amount;
        if (total > r.amount) revert RefundExceedsPaid();

        r.refunded = total;
        r.status = total == r.amount ? Status.Refunded : Status.PartiallyRefunded;

        // Pull from the merchant-signed payout. Capped by what this invoice delivered to payout (exact, see the
        // fee-on-transfer check in pay), so naming someone else's address as payout can never net-take their funds.
        // slither-disable-next-line arbitrary-send-erc20
        IERC20(r.token).safeTransferFrom(r.payout, r.payer, amount);
        emit InvoiceRefunded(msg.sender, orderId, r.payer, amount, total);
    }

    /// @inheritdoc IPaymentProcessor
    function cancelInvoice(bytes32 orderId) external {
        Receipt storage r = _receipts[msg.sender][orderId];
        if (r.status != Status.None) revert InvalidStatus(r.status);
        r.status = Status.Cancelled;
        emit InvoiceCancelled(msg.sender, orderId);
    }

    /// @inheritdoc IPaymentProcessor
    function bumpNonce() external returns (uint256 newMinNonce) {
        newMinNonce = ++minNonce[msg.sender];
        emit NonceBumped(msg.sender, newMinNonce);
    }

    /// @inheritdoc IPaymentProcessor
    function getReceipt(address merchant, bytes32 orderId) external view returns (Receipt memory) {
        return _receipts[merchant][orderId];
    }

    /// @inheritdoc IPaymentProcessor
    function hashInvoice(Invoice calldata inv) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(INVOICE_TYPEHASH, inv.orderId, inv.merchant, inv.payout, inv.token, inv.amount, inv.expiry, inv.nonce)
            )
        );
    }
}
