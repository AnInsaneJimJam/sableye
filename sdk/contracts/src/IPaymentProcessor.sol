// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Sableye payment processor interface (frozen in #24; change only through that issue)
/// @notice Merchants sign EIP-712 invoices off-chain; customers pay them on-chain.
/// The processor moves tokens payer -> payout directly and never holds a balance.
interface IPaymentProcessor {
    /// @dev EIP-712 type: Invoice(bytes32 orderId,address merchant,address payout,address token,uint256 amount,uint64 expiry,uint256 nonce)
    struct Invoice {
        bytes32 orderId; // merchant-chosen id, unique per merchant
        address merchant; // signer (EOA or ERC-1271 contract)
        address payout; // where the funds go
        address token; // ERC-20 to pay in
        uint256 amount; // token base units
        uint64 expiry; // unix seconds; pay() reverts after this
        uint256 nonce; // valid while nonce >= minNonce(merchant); bumpNonce() revokes all older invoices
    }

    /// @dev Only moves forward: None -> Paid -> PartiallyRefunded -> Refunded, or None -> Cancelled.
    enum Status {
        None,
        Paid,
        PartiallyRefunded,
        Refunded,
        Cancelled
    }

    struct Receipt {
        Status status;
        address payer;
        address payout;
        address token;
        uint256 amount;
        uint256 refunded;
        uint64 paidAt;
        uint64 paidBlock;
    }

    event InvoicePaid(
        address indexed merchant, bytes32 indexed orderId, address indexed payer, address token, uint256 amount, address payout
    );
    event InvoiceRefunded(address indexed merchant, bytes32 indexed orderId, address indexed payer, uint256 amount, uint256 totalRefunded);
    event InvoiceCancelled(address indexed merchant, bytes32 indexed orderId);
    event NonceBumped(address indexed merchant, uint256 minNonce);

    error InvoiceExpired();
    error InvoiceRevoked();
    error InvalidSignature();
    error InvalidStatus(Status current);
    error RefundExceedsPaid();
    error ZeroRefund();
    error FeeOnTransferNotSupported();

    /// @notice Pay an invoice. Caller is the payer and must have approved `amount` of `token` to this contract.
    function pay(Invoice calldata invoice, bytes calldata merchantSig) external;

    /// @notice Pay in one transaction using an EIP-2612 permit instead of a separate approve. Caller is the payer.
    function payWithPermit(Invoice calldata invoice, bytes calldata merchantSig, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external;

    /// @notice Gasless payment: anyone (e.g. the merchant's relayer, paying gas) submits the payer's EIP-3009
    /// `ReceiveWithAuthorization` signature. Its nonce must equal `hashInvoice(invoice)`, binding it to this invoice.
    function payWithAuthorization(
        Invoice calldata invoice,
        bytes calldata merchantSig,
        address payer,
        uint256 validAfter,
        uint256 validBefore,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /// @notice Refund part or all of a paid invoice. Caller must be the merchant; funds are pulled from the
    /// receipt's payout address (which must have approved this contract) back to the payer.
    function refund(bytes32 orderId, uint256 amount) external;

    /// @notice Revoke one unpaid invoice / payment link. Caller must be the merchant.
    function cancelInvoice(bytes32 orderId) external;

    /// @notice Revoke every outstanding invoice of the caller signed with a nonce lower than the new minimum.
    function bumpNonce() external returns (uint256 newMinNonce);

    function minNonce(address merchant) external view returns (uint256);
    function getReceipt(address merchant, bytes32 orderId) external view returns (Receipt memory);
    function hashInvoice(Invoice calldata invoice) external view returns (bytes32);
}

/// @dev EIP-3009 subset (USDC / Whitechain test USDT).
interface IERC3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}
