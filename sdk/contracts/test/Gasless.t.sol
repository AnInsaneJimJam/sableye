// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {PaymentProcessor} from "../src/PaymentProcessor.sol";
import {IPaymentProcessor} from "../src/IPaymentProcessor.sol";

/// Like Whitechain's test USDT: EIP-2612 permit + EIP-3009 receiveWithAuthorization, domain ("Tether USD", "1").
contract MockUSDT3009 is ERC20, ERC20Permit {
    bytes32 public constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    mapping(address => mapping(bytes32 => bool)) public authorizationState;

    constructor() ERC20("Tether USD", "USDT") ERC20Permit("Tether USD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }

    function receiveWithAuthorization(
        address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce,
        uint8 v, bytes32 r, bytes32 s
    ) external {
        require(msg.sender == to, "caller must be payee");
        require(block.timestamp > validAfter && block.timestamp < validBefore, "auth not valid now");
        require(!authorizationState[from][nonce], "auth used");
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(RECEIVE_TYPEHASH, from, to, value, validAfter, validBefore, nonce)));
        require(ECDSA.recover(digest, v, r, s) == from, "invalid auth sig");
        authorizationState[from][nonce] = true;
        _transfer(from, to, value);
    }
}

contract GaslessTest is Test {
    PaymentProcessor pp;
    MockUSDT3009 usdt;
    uint256 merchantKey = 0xA11CE;
    address merchant = vm.addr(merchantKey);
    uint256 payerKey = 0xB0B;
    address payer = vm.addr(payerKey);
    address payout = makeAddr("payout");
    address relayer = makeAddr("relayer");

    function setUp() public {
        pp = new PaymentProcessor();
        usdt = new MockUSDT3009();
        usdt.mint(payer, 1_000e6); // note: payer never calls approve in these tests
    }

    function _invoice(bytes32 orderId, uint256 amount) internal view returns (IPaymentProcessor.Invoice memory) {
        return IPaymentProcessor.Invoice(orderId, merchant, payout, address(usdt), amount, uint64(block.timestamp + 1 hours), 0);
    }

    function _merchantSig(IPaymentProcessor.Invoice memory inv) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(merchantKey, pp.hashInvoice(inv));
        return abi.encodePacked(r, s, v);
    }

    function _permit(uint256 amount, uint256 deadline) internal view returns (uint8, bytes32, bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                payer, address(pp), amount, usdt.nonces(payer), deadline
            )
        );
        return vm.sign(payerKey, keccak256(abi.encodePacked("\x19\x01", usdt.DOMAIN_SEPARATOR(), structHash)));
    }

    function _auth(IPaymentProcessor.Invoice memory inv, bytes32 nonce) internal view returns (uint8, bytes32, bytes32) {
        bytes32 structHash =
            keccak256(abi.encode(usdt.RECEIVE_TYPEHASH(), payer, address(pp), inv.amount, 0, block.timestamp + 1 hours, nonce));
        return vm.sign(payerKey, keccak256(abi.encodePacked("\x19\x01", usdt.DOMAIN_SEPARATOR(), structHash)));
    }

    // ---------- permit: one transaction, no separate approve ----------

    function test_payWithPermit() public {
        IPaymentProcessor.Invoice memory inv = _invoice("o1", 5e6);
        bytes memory sig = _merchantSig(inv);
        (uint8 v, bytes32 r, bytes32 s) = _permit(5e6, block.timestamp + 1 hours);
        vm.prank(payer);
        pp.payWithPermit(inv, sig, block.timestamp + 1 hours, v, r, s);
        assertEq(usdt.balanceOf(payout), 5e6);
        assertEq(usdt.balanceOf(address(pp)), 0);
    }

    function test_payWithPermit_survivesFrontRunPermit() public {
        IPaymentProcessor.Invoice memory inv = _invoice("o1", 5e6);
        bytes memory sig = _merchantSig(inv);
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _permit(5e6, deadline);
        usdt.permit(payer, address(pp), 5e6, deadline, v, r, s); // attacker submits it first
        vm.prank(payer);
        pp.payWithPermit(inv, sig, deadline, v, r, s);
        assertEq(usdt.balanceOf(payout), 5e6);
    }

    // ---------- EIP-3009: gasless, relayer pays gas ----------

    function test_payWithAuthorization_relayerPaysGas() public {
        IPaymentProcessor.Invoice memory inv = _invoice("o1", 5e6);
        bytes memory sig = _merchantSig(inv);
        (uint8 v, bytes32 r, bytes32 s) = _auth(inv, pp.hashInvoice(inv));

        vm.expectEmit(address(pp));
        emit IPaymentProcessor.InvoicePaid(merchant, "o1", payer, address(usdt), 5e6, payout);
        vm.prank(relayer);
        pp.payWithAuthorization(inv, sig, payer, 0, block.timestamp + 1 hours, v, r, s);

        assertEq(usdt.balanceOf(payout), 5e6);
        assertEq(usdt.balanceOf(address(pp)), 0);
        assertEq(pp.getReceipt(merchant, "o1").payer, payer);
    }

    function test_revert_authorizationReusedForOtherInvoice() public {
        IPaymentProcessor.Invoice memory a = _invoice("o1", 5e6);
        (uint8 v, bytes32 r, bytes32 s) = _auth(a, pp.hashInvoice(a));

        // Relayer tries to spend the payer's authorization on a different invoice (same amount, same merchant).
        IPaymentProcessor.Invoice memory b = _invoice("o2", 5e6);
        bytes memory sigB = _merchantSig(b);
        vm.prank(relayer);
        vm.expectRevert("invalid auth sig");
        pp.payWithAuthorization(b, sigB, payer, 0, block.timestamp + 1 hours, v, r, s);
    }

    function test_revert_relayerCannotRedirectPayout() public {
        IPaymentProcessor.Invoice memory inv = _invoice("o1", 5e6);
        bytes memory sig = _merchantSig(inv);
        IPaymentProcessor.Invoice memory evil = inv;
        evil.payout = relayer;
        (uint8 v, bytes32 r, bytes32 s) = _auth(evil, pp.hashInvoice(evil));
        vm.prank(relayer);
        vm.expectRevert(IPaymentProcessor.InvalidSignature.selector);
        pp.payWithAuthorization(evil, sig, payer, 0, block.timestamp + 1 hours, v, r, s);
    }

    function test_revert_authorizationDoublePay() public {
        IPaymentProcessor.Invoice memory inv = _invoice("o1", 5e6);
        bytes memory sig = _merchantSig(inv);
        (uint8 v, bytes32 r, bytes32 s) = _auth(inv, pp.hashInvoice(inv));
        vm.prank(relayer);
        pp.payWithAuthorization(inv, sig, payer, 0, block.timestamp + 1 hours, v, r, s);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(IPaymentProcessor.InvalidStatus.selector, IPaymentProcessor.Status.Paid));
        pp.payWithAuthorization(inv, sig, payer, 0, block.timestamp + 1 hours, v, r, s);
    }
}
