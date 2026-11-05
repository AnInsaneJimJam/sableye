// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {DepositFactory} from "../src/DepositFactory.sol";

contract Deploy is Script {
    function run() external {
        vm.startBroadcast();
        DepositFactory factory = new DepositFactory();
        vm.stopBroadcast();
        console.log("DepositFactory:", address(factory));
    }
}
