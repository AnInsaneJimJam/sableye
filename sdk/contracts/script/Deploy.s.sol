// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PaymentProcessor} from "../src/PaymentProcessor.sol";
import {SubscriptionManager} from "../src/SubscriptionManager.sol";

/// Deploys both contracts. Neither has an owner, admin or upgrade path.
///
/// Whitechain Sepolia (1874):
///   forge script script/Deploy.s.sol --rpc-url https://rpc.testnet.whitechain.io --private-key $MERCHANT_KEY --broadcast \
///     --verify --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/
/// Whitechain mainnet (1875): same command with --rpc-url https://rpc.whitechain.io and
///     --verifier-url https://explorer.whitechain.io/api/
contract Deploy is Script {
    function run() external returns (PaymentProcessor pp, SubscriptionManager sm) {
        require(block.chainid == 1874 || block.chainid == 1875 || block.chainid == 31337, "unexpected chain");
        vm.startBroadcast();
        pp = new PaymentProcessor();
        sm = new SubscriptionManager();
        vm.stopBroadcast();
        console.log("chain:", block.chainid);
        console.log("PaymentProcessor:", address(pp));
        console.log("SubscriptionManager:", address(sm));
    }
}
