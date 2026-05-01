// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title PawnToken
/// @notice Simple Base Sepolia test token for exercising Pawn Agent token-detection flows.
contract PawnToken is ERC20 {
    uint8 private immutable _tokenDecimals;

    constructor(address initialHolder, uint256 initialSupply, uint8 tokenDecimals)
        ERC20("Pawn Token", "PAWN")
    {
        _tokenDecimals = tokenDecimals;
        _mint(initialHolder, initialSupply);
    }

    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }
}
