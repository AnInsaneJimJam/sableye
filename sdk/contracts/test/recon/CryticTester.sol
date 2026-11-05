// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CryticAsserts} from "@chimera/CryticAsserts.sol";
import {TargetFunctions} from "./TargetFunctions.sol";

/// Entry point for Medusa / Echidna: `medusa fuzz` (config in sdk/contracts/medusa.json).
contract CryticTester is TargetFunctions, CryticAsserts {
    constructor() payable {
        setup();
    }
}
