// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/src/Script.sol";
import "../src/BuyoutSettlement.sol";

/// @notice Deploys BuyoutSettlement to Base Sepolia and prints the deployed address.
/// @dev Usage:
///   export BASE_SEPOLIA_RPC_URL=<your_rpc_url>
///   export DEPLOYER_PRIVATE_KEY=<your_key>
///   forge script script/DeployBuyoutSettlement.s.sol \
///     --rpc-url base_sepolia \
///     --broadcast \
///     --verify
contract DeployBuyoutSettlement is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying BuyoutSettlement from:", deployer);
        console.log("Network: Base Sepolia");

        vm.startBroadcast(deployerPrivateKey);

        BuyoutSettlement settlement = new BuyoutSettlement{value: 0.1 ether}();

        vm.stopBroadcast();

        console.log("");
        console.log("BuyoutSettlement deployed at:", address(settlement));
        console.log("Deployer funded contract with: 0.1 ETH for initial payout reserves");
        console.log("");
        console.log("Verify at:");
        console.log("  base-sepolia etherscan:", address(settlement));
    }
}
