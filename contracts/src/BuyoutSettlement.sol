// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BuyoutSettlement
/// @notice Atomic ETH-for-ERC20 buyout settlement on Base Sepolia.
///         Merchants submit buyout offers; sellers accept and receive ETH atomically.
/// @dev Trust model: the merchant's ENS address = their wallet = the trusted signer.
///         Offers are trusted as coming from the merchant because they are signed by the merchant's wallet.
///         The contract performs an atomic swap: it pulls ERC-20 tokens from the seller
///         and sends ETH payout to the seller in one transaction.
contract BuyoutSettlement {
    // =========================================================================
    // Errors
    // =========================================================================

    error DealNotFound();
    error DealNotPending();
    error DealExpired();
    error NotExpiredYet();
    error InsufficientContractBalance();
    error TransferFailed();
    error OnlyMerchant();
    error ZeroAmount();
    error DuplicateOfferId();

    // =========================================================================
    // Enums
    // =========================================================================

    enum DealState {
        PENDING,
        EXECUTED,
        CANCELLED,
        EXPIRED
    }

    // =========================================================================
    // Structs
    // =========================================================================

    /// @param merchant        ENS/wallet address of the merchant — identity + signer
    /// @param seller          Address that will receive ETH and give input tokens
    /// @param inputToken     ERC-20 token address the seller gives
    /// @param inputAmount    How many input tokens
    /// @param payoutAmount   ETH (in wei) the seller receives on acceptance
    /// @param expiresAt       Unix timestamp after which the offer can be expired
    /// @param nonce           Unique-per-merchant identifier to prevent duplicate offer IDs
    /// @param state           Current lifecycle state
    struct Deal {
        address merchant;
        address seller;
        address inputToken;
        uint256 inputAmount;
        uint256 payoutAmount;
        uint256 expiresAt;
        uint256 nonce;
        DealState state;
    }

    // =========================================================================
    // State
    // =========================================================================

    /// @notice All submitted deals, keyed by uint256 hash of (merchant, nonce)
    mapping(uint256 => Deal) public deals;

    /// @notice Track used nonces per merchant to prevent duplicates
    mapping(address => mapping(uint256 => bool)) public usedNonces;

    /// @notice Counter for total deals submitted (informational)
    uint256 public totalDeals;

    // =========================================================================
    // Events
    // =========================================================================

    event OfferSubmitted(
        uint256 indexed dealId,
        address indexed merchant,
        address indexed seller,
        address inputToken,
        uint256 inputAmount,
        uint256 payoutAmount,
        uint256 expiresAt,
        uint256 nonce
    );

    event OfferAccepted(
        uint256 indexed dealId,
        address indexed merchant,
        address indexed seller,
        address inputToken,
        uint256 inputAmount,
        uint256 payoutAmount
    );

    event OfferCancelled(uint256 indexed dealId, address indexed merchant);

    event OfferExpired(uint256 indexed dealId, address indexed merchant, uint256 expiredAt);

    // =========================================================================
    // Constructor
    // =========================================================================

    constructor() payable {
        // Contract can receive ETH deposits to fund payouts
    }

    // =========================================================================
    // External write functions
    // =========================================================================

    /// @notice Merchant submits a buyout offer.
    /// @param  seller        Address that will receive ETH payout and give input tokens
    /// @param  inputToken    ERC-20 token the seller must deliver
    /// @param  inputAmount   Quantity of input tokens
    /// @param  payoutAmount  ETH in wei to pay the seller
    /// @param  expiresAt     Unix timestamp — offer is valid until this time
    /// @param  nonce         Unique identifier chosen by merchant to prevent duplicate deal IDs
    /// @return dealId        The canonical deal ID (keccak256 of merchant + nonce)
    function submitOffer(
        address seller,
        address inputToken,
        uint256 inputAmount,
        uint256 payoutAmount,
        uint256 expiresAt,
        uint256 nonce
    ) external returns (uint256 dealId) {
        if (seller == address(0)) revert ZeroAmount();
        if (inputToken == address(0)) revert ZeroAmount();
        if (inputAmount == 0) revert ZeroAmount();
        if (payoutAmount == 0) revert ZeroAmount();

        // Generate dealId from merchant address + nonce — prevents duplicates
        dealId = uint256(keccak256(abi.encodePacked(msg.sender, nonce)));

        // Revert if nonce already used (duplicate submission)
        if (usedNonces[msg.sender][nonce]) revert DuplicateOfferId();

        // Mark nonce used
        usedNonces[msg.sender][nonce] = true;

        // Store deal
        deals[dealId] = Deal({
            merchant: msg.sender,
            seller: seller,
            inputToken: inputToken,
            inputAmount: inputAmount,
            payoutAmount: payoutAmount,
            expiresAt: expiresAt,
            nonce: nonce,
            state: DealState.PENDING
        });

        totalDeals++;

        emit OfferSubmitted({
            dealId: dealId,
            merchant: msg.sender,
            seller: seller,
            inputToken: inputToken,
            inputAmount: inputAmount,
            payoutAmount: payoutAmount,
            expiresAt: expiresAt,
            nonce: nonce
        });
    }

    /// @notice Seller accepts a buyout offer. Contract pulls ERC-20 tokens from seller
    ///         and sends ETH payout atomically in one transaction.
    /// @param  dealId  The deal to accept
    function acceptOffer(uint256 dealId) external {
        Deal storage deal = deals[dealId];

        if (deal.merchant == address(0)) revert DealNotFound();
        if (deal.state != DealState.PENDING) revert DealNotPending();

        // Block expired deals
        if (block.timestamp > deal.expiresAt) {
            deal.state = DealState.EXPIRED;
            emit OfferExpired({ dealId: dealId, merchant: deal.merchant, expiredAt: block.timestamp });
            revert DealExpired();
        }

        // Ensure contract holds enough ETH to pay out
        if (address(this).balance < deal.payoutAmount) revert InsufficientContractBalance();

        // Mark executed BEFORE token pull to prevent reentrancy
        deal.state = DealState.EXECUTED;

        // Pull ERC-20 tokens FROM seller
        // Will revert if seller hasn't approved this contract or approval < inputAmount
        _pullERC20(deal.inputToken, deal.seller, deal.inputAmount);

        // Send ETH payout to seller
        (bool sent, ) = deal.seller.call{value: deal.payoutAmount}("");
        if (!sent) revert TransferFailed();

        emit OfferAccepted({
            dealId: dealId,
            merchant: deal.merchant,
            seller: deal.seller,
            inputToken: deal.inputToken,
            inputAmount: deal.inputAmount,
            payoutAmount: deal.payoutAmount
        });
    }

    /// @notice Merchant cancels a pending offer before acceptance or expiry.
    /// @param  dealId  The deal to cancel
    function cancelOffer(uint256 dealId) external {
        Deal storage deal = deals[dealId];

        if (deal.merchant == address(0)) revert DealNotFound();
        if (deal.state != DealState.PENDING) revert DealNotPending();
        if (deal.merchant != msg.sender) revert OnlyMerchant();

        deal.state = DealState.CANCELLED;

        emit OfferCancelled({ dealId: dealId, merchant: msg.sender });
    }

    /// @notice Anyone can expire an offer after its deadline.
    /// @param  dealId  The deal to expire
    function expireOffer(uint256 dealId) external {
        Deal storage deal = deals[dealId];

        if (deal.merchant == address(0)) revert DealNotFound();
        if (deal.state != DealState.PENDING) revert DealNotPending();
        if (block.timestamp <= deal.expiresAt) revert NotExpiredYet();

        deal.state = DealState.EXPIRED;

        emit OfferExpired({ dealId: dealId, merchant: deal.merchant, expiredAt: block.timestamp });
    }

    // =========================================================================
    // External view functions
    // =========================================================================

    /// @notice Returns the full deal struct for a given dealId.
    /// @param  dealId  The deal ID
    /// @return Deal    The deal struct
    function getDeal(uint256 dealId) external view returns (Deal memory) {
        return deals[dealId];
    }

    /// @notice Returns true if a given nonce has been used by a merchant.
    /// @param  merchant   The merchant address
    /// @param  nonce      The nonce to check
    /// @return bool       True if the nonce has been used
    function isNonceUsed(address merchant, uint256 nonce) external view returns (bool) {
        return usedNonces[merchant][nonce];
    }

    // =========================================================================
    // Internal helpers
    // =========================================================================

    /// @notice Pulls `amount` of `token` from `from` into the contract.
    ///         Reverts if the transfer fails (e.g., insufficient approval).
    /// @param  token   ERC-20 token address
    /// @param  from    Must have approved this contract for at least `amount`
    /// @param  amount  Quantity to pull
    function _pullERC20(
        address token,
        address from,
        uint256 amount
    ) internal {
        // Using SafeERC20 for clarity and safety, but raw call works here:
        // 1. encode the call
        bytes memory data = abi.encodeWithSignature(
            "transferFrom(address,address,uint256)",
            from,
            address(this),
            amount
        );
        // 2. execute low-level
        (bool success, bytes memory returnData) = token.call(data);
        // 3. handle both return-bool and no-return-value tokens
        if (returnData.length >= 32) {
            // Standard: decode and check
            bool result = abi.decode(returnData, (bool));
            if (!result || !success) revert TransferFailed();
        } else if (!success) {
            // Some tokens don't return a bool on failure — treat failed call as failure
            revert TransferFailed();
        }
        // success=true with no return data (non-standard but valid) — assume pass
    }

    // =========================================================================
    // Receive ETH
    // =========================================================================

    /// @notice Allows the contract to receive ETH deposits.
    ///         ETH is required here so the contract can pay out sellers.
    receive() external payable {}
}
