// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PaymentProcessor} from "../src/PaymentProcessor.sol";

/// forge script script/Deploy.s.sol --rpc-url https://rpc.testnet.whitechain.io --private-key $MERCHANT_KEY --broadcast \
///   --verify --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/
contract Deploy is Script {
    function run() external returns (PaymentProcessor pp) {
        vm.startBroadcast();
        pp = new PaymentProcessor();
        vm.stopBroadcast();
        console.log("PaymentProcessor:", address(pp));
    }
}
