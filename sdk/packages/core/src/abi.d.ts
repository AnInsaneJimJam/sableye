/** ABI of the Sableye PaymentProcessor contract. */
export declare const paymentProcessorAbi: readonly [{
    readonly type: "constructor";
    readonly inputs: readonly [];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "INVOICE_TYPEHASH";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "bytes32";
        readonly internalType: "bytes32";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "bumpNonce";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "newMinNonce";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "cancelInvoice";
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
        readonly internalType: "bytes32";
    }];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "eip712Domain";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "fields";
        readonly type: "bytes1";
        readonly internalType: "bytes1";
    }, {
        readonly name: "name";
        readonly type: "string";
        readonly internalType: "string";
    }, {
        readonly name: "version";
        readonly type: "string";
        readonly internalType: "string";
    }, {
        readonly name: "chainId";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }, {
        readonly name: "verifyingContract";
        readonly type: "address";
        readonly internalType: "address";
    }, {
        readonly name: "salt";
        readonly type: "bytes32";
        readonly internalType: "bytes32";
    }, {
        readonly name: "extensions";
        readonly type: "uint256[]";
        readonly internalType: "uint256[]";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "getReceipt";
    readonly inputs: readonly [{
        readonly name: "merchant";
        readonly type: "address";
        readonly internalType: "address";
    }, {
        readonly name: "orderId";
        readonly type: "bytes32";
        readonly internalType: "bytes32";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "tuple";
        readonly internalType: "struct IPaymentProcessor.Receipt";
        readonly components: readonly [{
            readonly name: "status";
            readonly type: "uint8";
            readonly internalType: "enum IPaymentProcessor.Status";
        }, {
            readonly name: "payer";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "payout";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "token";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "amount";
            readonly type: "uint256";
            readonly internalType: "uint256";
        }, {
            readonly name: "refunded";
            readonly type: "uint256";
            readonly internalType: "uint256";
        }, {
            readonly name: "paidAt";
            readonly type: "uint64";
            readonly internalType: "uint64";
        }, {
            readonly name: "paidBlock";
            readonly type: "uint64";
            readonly internalType: "uint64";
        }];
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "hashInvoice";
    readonly inputs: readonly [{
        readonly name: "inv";
        readonly type: "tuple";
        readonly internalType: "struct IPaymentProcessor.Invoice";
        readonly components: readonly [{
            readonly name: "orderId";
            readonly type: "bytes32";
            readonly internalType: "bytes32";
        }, {
            readonly name: "merchant";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "payout";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "token";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "amount";
            readonly type: "uint256";
            readonly internalType: "uint256";
        }, {
            readonly name: "expiry";
            readonly type: "uint64";
            readonly internalType: "uint64";
        }, {
            readonly name: "nonce";
            readonly type: "uint256";
            readonly internalType: "uint256";
        }];
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "bytes32";
        readonly internalType: "bytes32";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "minNonce";
    readonly inputs: readonly [{
        readonly name: "merchant";
        readonly type: "address";
        readonly internalType: "address";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "pay";
    readonly inputs: readonly [{
        readonly name: "inv";
        readonly type: "tuple";
        readonly internalType: "struct IPaymentProcessor.Invoice";
        readonly components: readonly [{
            readonly name: "orderId";
            readonly type: "bytes32";
            readonly internalType: "bytes32";
        }, {
            readonly name: "merchant";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "payout";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "token";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "amount";
            readonly type: "uint256";
            readonly internalType: "uint256";
        }, {
            readonly name: "expiry";
            readonly type: "uint64";
            readonly internalType: "uint64";
        }, {
            readonly name: "nonce";
            readonly type: "uint256";
            readonly internalType: "uint256";
        }];
    }, {
        readonly name: "merchantSig";
        readonly type: "bytes";
        readonly internalType: "bytes";
    }];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "refund";
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
        readonly internalType: "bytes32";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "event";
    readonly name: "EIP712DomainChanged";
    readonly inputs: readonly [];
    readonly anonymous: false;
}, {
    readonly type: "event";
    readonly name: "InvoiceCancelled";
    readonly inputs: readonly [{
        readonly name: "merchant";
        readonly type: "address";
        readonly indexed: true;
        readonly internalType: "address";
    }, {
        readonly name: "orderId";
        readonly type: "bytes32";
        readonly indexed: true;
        readonly internalType: "bytes32";
    }];
    readonly anonymous: false;
}, {
    readonly type: "event";
    readonly name: "InvoicePaid";
    readonly inputs: readonly [{
        readonly name: "merchant";
        readonly type: "address";
        readonly indexed: true;
        readonly internalType: "address";
    }, {
        readonly name: "orderId";
        readonly type: "bytes32";
        readonly indexed: true;
        readonly internalType: "bytes32";
    }, {
        readonly name: "payer";
        readonly type: "address";
        readonly indexed: true;
        readonly internalType: "address";
    }, {
        readonly name: "token";
        readonly type: "address";
        readonly indexed: false;
        readonly internalType: "address";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }, {
        readonly name: "payout";
        readonly type: "address";
        readonly indexed: false;
        readonly internalType: "address";
    }];
    readonly anonymous: false;
}, {
    readonly type: "event";
    readonly name: "InvoiceRefunded";
    readonly inputs: readonly [{
        readonly name: "merchant";
        readonly type: "address";
        readonly indexed: true;
        readonly internalType: "address";
    }, {
        readonly name: "orderId";
        readonly type: "bytes32";
        readonly indexed: true;
        readonly internalType: "bytes32";
    }, {
        readonly name: "payer";
        readonly type: "address";
        readonly indexed: true;
        readonly internalType: "address";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }, {
        readonly name: "totalRefunded";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }];
    readonly anonymous: false;
}, {
    readonly type: "event";
    readonly name: "NonceBumped";
    readonly inputs: readonly [{
        readonly name: "merchant";
        readonly type: "address";
        readonly indexed: true;
        readonly internalType: "address";
    }, {
        readonly name: "minNonce";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }];
    readonly anonymous: false;
}, {
    readonly type: "error";
    readonly name: "FeeOnTransferNotSupported";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "InvalidShortString";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "InvalidSignature";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "InvalidStatus";
    readonly inputs: readonly [{
        readonly name: "current";
        readonly type: "uint8";
        readonly internalType: "enum IPaymentProcessor.Status";
    }];
}, {
    readonly type: "error";
    readonly name: "InvoiceExpired";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "InvoiceRevoked";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "RefundExceedsPaid";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "SafeERC20FailedOperation";
    readonly inputs: readonly [{
        readonly name: "token";
        readonly type: "address";
        readonly internalType: "address";
    }];
}, {
    readonly type: "error";
    readonly name: "StringTooLong";
    readonly inputs: readonly [{
        readonly name: "str";
        readonly type: "string";
        readonly internalType: "string";
    }];
}];
