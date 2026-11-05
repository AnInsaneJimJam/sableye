// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Forwarder} from "./Forwarder.sol";

/// @notice Deterministic deposit addresses: one per (merchant, intentId), usable before deployment.
/// Sweeping is permissionless; the destination is baked into the address, so nobody can redirect funds.
contract DepositFactory {
    event Swept(address indexed merchant, bytes32 indexed intentId, address indexed token, address deposit, uint256 amount);

    function computeAddress(address merchant, bytes32 intentId) public view returns (address) {
        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0xff), address(this), _salt(merchant, intentId), keccak256(_initCode(merchant)))
        );
        return address(uint160(uint256(hash)));
    }

    function sweep(address merchant, bytes32 intentId, address token) external returns (uint256 amount) {
        address deposit = computeAddress(merchant, intentId);
        if (deposit.code.length == 0) {
            new Forwarder{salt: _salt(merchant, intentId)}(merchant);
        }
        amount = Forwarder(deposit).sweep(token);
        emit Swept(merchant, intentId, token, deposit, amount);
    }

    function _salt(address merchant, bytes32 intentId) private pure returns (bytes32) {
        return keccak256(abi.encode(merchant, intentId));
    }

    function _initCode(address merchant) private pure returns (bytes memory) {
        return abi.encodePacked(type(Forwarder).creationCode, abi.encode(merchant));
    }
}
