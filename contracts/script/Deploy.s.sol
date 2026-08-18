// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {InvoiceFactory} from "../src/InvoiceFactory.sol";

/// @notice Deploys InvoiceFactory through the canonical deterministic
/// deployment proxy (0x4e59b44847b379578588920cA78FbF26c0B4956C), which
/// already exists on essentially every EVM chain including all three
/// testnets we're targeting. Same salt + same init code + same proxy address
/// = same factory address on every chain, which is the whole point.
///
/// Usage (run once per chain, same SALT env var every time):
///   forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify
///   forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia --broadcast --verify
///
/// After both runs, diff the printed factory address - it must match.
contract Deploy is Script {
    address constant CREATE2_PROXY = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    function run() external {
        bytes32 salt = vm.envOr("SALT", bytes32(uint256(1)));
        address owner = vm.envAddress("REGISTRAR_ADDRESS");
        address sink = vm.envAddress("SETTLEMENT_SINK");

        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(pk);

        bytes memory initCode = abi.encodePacked(type(InvoiceFactory).creationCode, abi.encode(owner, sink));
        address predicted = computeAddress(salt, initCode);

        console2.log("Predicted factory address:", predicted);

        if (predicted.code.length > 0) {
            console2.log("Already deployed at this address on this chain, skipping.");
        } else {
            (bool ok, bytes memory ret) = CREATE2_PROXY.call(abi.encodePacked(salt, initCode));
            require(ok, "CREATE2 deployment failed");
            address deployed = address(uint160(bytes20(ret)));
            require(deployed == predicted, "address mismatch after deploy");
            console2.log("Deployed InvoiceFactory at:", deployed);
        }
        console2.log("Factory owner:", owner);
        console2.log("Settlement sink:", sink);

        vm.stopBroadcast();
    }

    function computeAddress(bytes32 salt, bytes memory initCode) public pure returns (address) {
        bytes32 initCodeHash = keccak256(initCode);
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            CREATE2_PROXY,
            salt,
            initCodeHash
        )))));
    }
}
