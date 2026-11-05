// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Lives at a per-payment CREATE2 address. Anyone may call sweep; funds can only go to `merchant`.
contract Forwarder {
    address public immutable merchant;

    constructor(address merchant_) {
        merchant = merchant_;
    }

    function sweep(address token) external returns (uint256 amount) {
        amount = IERC20(token).balanceOf(address(this));
        if (amount == 0) return 0;
        // Low-level call: tolerates tokens that return no bool (USDT-style).
        (bool ok, bytes memory data) = token.call(abi.encodeCall(IERC20.transfer, (merchant, amount)));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "transfer failed");
    }
}

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
}
