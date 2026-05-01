// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/src/Script.sol";
import "../src/PawnToken.sol";

/// @notice Deploy a generic PAWN ERC-20 to Base Sepolia for Pawn Agent testing.
/// @dev Usage:
///   export BASE_SEPOLIA_RPC_URL=<your_rpc_url>
///   export DEPLOYER_PRIVATE_KEY=<your_key>
///   forge script script/DeployPawnToken.s.sol --rpc-url base_sepolia --broadcast
contract DeployPawnToken is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        uint8 decimals_ = uint8(vm.envOr("PAWN_TOKEN_DECIMALS", uint256(18)));
        uint256 supplyUnits = vm.envOr("PAWN_INITIAL_SUPPLY_UNITS", uint256(1_000_000));
        uint256 initialSupply = supplyUnits * (10 ** uint256(decimals_));

        console.log("Deploying PAWN token from:", deployer);
        console.log("Network: Base Sepolia");
        console.log("Token decimals:", decimals_);
        console.log("Initial supply units:", supplyUnits);

        vm.startBroadcast(deployerPrivateKey);
        PawnToken token = new PawnToken(deployer, initialSupply, decimals_);
        vm.stopBroadcast();

        console.log("");
        console.log("PAWN token deployed at:", address(token));
        console.log("Minted to deployer:", deployer);
        console.log("Raw initial supply:", initialSupply);
    }
}
