// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title PawnShop
/// @notice Legacy exploratory loan-era scaffold from the project's earlier concept phase.
///         The canonical MVP direction is now buyout-first on Base Sepolia.
///         This contract is published for public history and will be replaced or archived
///         as the buyout settlement flow is implemented.
/// @dev ERC-20 collateral only in this exploratory scaffold. ERC-721 support was planned.
contract PawnShop is ReentrancyGuard {

    // =========================================================================
    // Enums & Structs
    // =========================================================================

    enum LoanState { Proposed, Active, Repaid, Defaulted, Liquidated }

    struct Loan {
        address borrower;
        address collateralToken;    // ERC-20 or ERC-721 address
        uint256 collateralTokenId; // 0 for ERC-20
        uint256 collateralAmount;  // 1 for ERC-721, amount for ERC-20
        address principalToken;    // token borrowed
        uint256 principalAmount;  // amount lent
        uint256 repaymentAmount;  // principal + interest
        uint256 createdAt;
        uint256 expiresAt;
        LoanState state;
    }

    // =========================================================================
    // State
    // =========================================================================

    uint256 public nextLoanId;
    mapping(uint256 => Loan) public loans;
    address public owner;

    // Accepted collateral tokens
    mapping(address => bool) public acceptedCollateral;

    // Events (the agent's primary feed)
    event LoanProposed(
        uint256 indexed loanId,
        address indexed borrower,
        address collateralToken,
        uint256 collateralAmount,
        address principalToken,
        uint256 principalRequested
    );

    event LoanAccepted(
        uint256 indexed loanId,
        uint256 repaymentAmount,
        uint256 expiresAt
    );

    event LoanRepaid(
        uint256 indexed loanId,
        uint256 repaymentAmount
    );

    event LoanDefaulted(uint256 indexed loanId);

    event LiquidationExecuted(
        uint256 indexed loanId,
        uint256 collateralRecovered,
        address indexed swapOutputToken,
        uint256 swapOutputAmount
    );

    event ProfitsWithdrawn(address indexed to, uint256 amount);

    // =========================================================================
    // Constructor
    // =========================================================================

    constructor() {
        owner = msg.sender;
    }

    // =========================================================================
    // Mutative Methods
    // =========================================================================

    /// @notice Borrower proposes a loan by depositing collateral.
    /// @param collateralToken ERC-20 or ERC-721 address
    /// @param principalToken Token the borrower wants to receive
    /// @param principalRequested Amount requested
    function proposeLoan(
        address collateralToken,
        uint256 collateralTokenId,
        uint256 collateralAmount,
        address principalToken,
        uint256 principalRequested
    ) external nonReentrant {
        require(acceptedCollateral[collateralToken], "Collateral not accepted");
        require(IERC20(collateralToken).balanceOf(msg.sender) >= collateralAmount, "Insufficient collateral");

        // Transfer collateral to this contract
        IERC20(collateralToken).transferFrom(msg.sender, address(this), collateralAmount);

        uint256 loanId = nextLoanId++;
        loans[loanId] = Loan({
            borrower: msg.sender,
            collateralToken: collateralToken,
            collateralTokenId: collateralTokenId,
            collateralAmount: collateralAmount,
            principalToken: principalToken,
            principalAmount: principalRequested,
            repaymentAmount: 0,           // Set by agent on accept
            createdAt: block.timestamp,
            expiresAt: 0,                 // Set by agent on accept
            state: LoanState.Proposed
        });

        emit LoanProposed(loanId, msg.sender, collateralToken, collateralAmount, principalToken, principalRequested);
    }

    /// @notice Agent accepts a proposed loan. Sends principal to borrower.
    /// @dev Callable by anyone — agent is the intended caller.
    function acceptLoan(uint256 loanId, uint256 repaymentAmount, uint256 durationSeconds)
        external
        nonReentrant
    {
        Loan storage loan = loans[loanId];
        require(loan.state == LoanState.Proposed, "Not in proposed state");
        require(loan.principalAmount > 0, "Loan not initialized");
        require(durationSeconds > 0, "Duration must be positive");

        // Calculate expiry
        uint256 expiresAt = block.timestamp + durationSeconds;

        // Update loan state
        loan.repaymentAmount = repaymentAmount;
        loan.expiresAt = expiresAt;
        loan.state = LoanState.Active;

        // Transfer principal to borrower
        require(
            IERC20(loan.principalToken).transfer(loan.borrower, loan.principalAmount),
            "Principal transfer failed"
        );

        emit LoanAccepted(loanId, repaymentAmount, expiresAt);
    }

    /// @notice Borrower repays loan, reclaiming their collateral.
    function repay(uint256 loanId) external payable nonReentrant {
        Loan storage loan = loans[loanId];
        require(loan.state == LoanState.Active, "Loan not active");
        require(msg.sender == loan.borrower, "Not the borrower");
        require(
            IERC20(loan.principalToken).transferFrom(msg.sender, address(this), loan.repaymentAmount),
            "Repayment transfer failed"
        );

        loan.state = LoanState.Repaid;

        // Return collateral to borrower
        IERC20(loan.collateralToken).transfer(loan.borrower, loan.collateralAmount);

        emit LoanRepaid(loanId, loan.repaymentAmount);
    }

    /// @notice Agent liquidates an expired loan after default.
    ///         Collateral is transferred to the caller (agent wallet) for swap.
    function liquidate(uint256 loanId) external nonReentrant {
        Loan storage loan = loans[loanId];
        require(loan.state == LoanState.Active, "Loan not active");
        require(block.timestamp > loan.expiresAt, "Loan not expired");

        loan.state = LoanState.Liquidated;

        // Transfer collateral to agent (caller) for Uniswap swap
        IERC20(loan.collateralToken).transfer(msg.sender, loan.collateralAmount);

        emit LiquidationExecuted(
            loanId,
            loan.collateralAmount,
            loan.principalToken,
            loan.principalAmount
        );
    }

    /// @notice Owner withdraws accumulated profits.
    function withdrawProfits(address token, uint256 amount) external {
        require(msg.sender == owner, "Not owner");
        require(IERC20(token).transfer(owner, amount), "Transfer failed");
        emit ProfitsWithdrawn(owner, amount);
    }

    // =========================================================================
    // Admin
    // =========================================================================

    function setAcceptedCollateral(address token, bool allowed) external {
        require(msg.sender == owner, "Not owner");
        acceptedCollateral[token] = allowed;
    }

    // =========================================================================
    // Views
    // =========================================================================

    function getLoan(uint256 loanId) external view returns (Loan memory) {
        return loans[loanId];
    }

    function getOutstandingLoansCount() external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < nextLoanId; i++) {
            if (loans[i].state == LoanState.Active) count++;
        }
        return count;
    }
}
