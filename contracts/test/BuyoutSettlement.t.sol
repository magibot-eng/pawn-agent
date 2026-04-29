// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/src/Test.sol";
import "openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../../src/BuyoutSettlement.sol";

/// @notice A mintable ERC-20 token for testing — no decimals or special behavior.
contract TestToken is ERC20 {
    constructor() ERC20("Test Token", "TEST") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @title BuyoutSettlementTest
/// @notice Foundry tests for the full buyout deal lifecycle.
contract BuyoutSettlementTest is Test {
    BuyoutSettlement public settlement;
    TestToken public token;

    // Test accounts
    address merchant = makeAddr("merchant");
    address seller = makeAddr("seller");
    address other = makeAddr("other");

    // Deal parameters
    uint256 constant INPUT_AMOUNT = 1000e18;
    uint256 constant PAYOUT_AMOUNT = 0.1 ether;
    uint256 constant NONCE = 1;
    // Note: expiry timestamps are computed at test runtime to avoid
    // "constant variable needs compile-time constant" error.
    function _futureExpiry() internal view returns (uint256) { return block.timestamp + 3600; }
    function _pastExpiry() internal view returns (uint256) { return block.timestamp - 1; }

    function setUp() public {
        settlement = new BuyoutSettlement{value: 10 ether}();
        token = new TestToken();

        // Give seller some tokens
        token.mint(seller, INPUT_AMOUNT * 10);
        vm.prank(seller);
        token.approve(address(settlement), type(uint256).max);
    }

    // ========================================================================
    // Happy path
    // ========================================================================

    function test_merchantCanSubmitOffer() public {
        uint256 dealId = _submitOffer(merchant, seller, _futureExpiry());

        // Direct field reads via public mapping getter
        assertEq(settlement.getDeal(dealId).merchant, merchant);
        assertEq(settlement.getDeal(dealId).seller, seller);
        assertEq(settlement.getDeal(dealId).inputToken, address(token));
        assertEq(settlement.getDeal(dealId).inputAmount, INPUT_AMOUNT);
        assertEq(settlement.getDeal(dealId).payoutAmount, PAYOUT_AMOUNT);
        assertEq(settlement.getDeal(dealId).expiresAt, _futureExpiry());
        assertEq(settlement.getDeal(dealId).nonce, NONCE);
        assertEq(uint8(settlement.getDeal(dealId).state), uint8(BuyoutSettlement.DealState.PENDING));
    }

    function test_sellerCanAcceptOffer() public {
        uint256 dealId = _submitOffer(merchant, seller, _futureExpiry());

        uint256 sellerEthBefore = seller.balance;

        vm.prank(seller);
        settlement.acceptOffer(dealId);

        assertEq(uint8(settlement.getDeal(dealId).state), uint8(BuyoutSettlement.DealState.EXECUTED));
        assertEq(seller.balance, sellerEthBefore + PAYOUT_AMOUNT);
    }

    function test_merchantCanCancelOffer() public {
        uint256 dealId = _submitOffer(merchant, seller, _futureExpiry());

        vm.prank(merchant);
        settlement.cancelOffer(dealId);

        assertEq(uint8(settlement.getDeal(dealId).state), uint8(BuyoutSettlement.DealState.CANCELLED));
    }

    function test_anyoneCanExpireOffer() public {
        uint256 dealId = _submitOffer(merchant, seller, _pastExpiry());

        vm.prank(other);
        settlement.expireOffer(dealId);

        assertEq(uint8(settlement.getDeal(dealId).state), uint8(BuyoutSettlement.DealState.EXPIRED));
    }

    function test_nonceCannotBeReused() public {
        uint256 dealId = _submitOffer(merchant, seller, _futureExpiry());

        vm.prank(merchant);
        vm.expectRevert(BuyoutSettlement.DuplicateOfferId.selector);
        settlement.submitOffer({
            seller: seller,
            inputToken: address(token),
            inputAmount: INPUT_AMOUNT,
            payoutAmount: PAYOUT_AMOUNT,
            expiresAt: _futureExpiry(),
            nonce: NONCE
        });
    }

    // ========================================================================
    // Rejection cases
    // ========================================================================

    function test_cannotAcceptExpiredOffer() public {
        uint256 dealId = _submitOffer(merchant, seller, _pastExpiry());

        vm.prank(seller);
        vm.expectRevert(BuyoutSettlement.DealExpired.selector);
        settlement.acceptOffer(dealId);
    }

    function test_cannotAcceptAlreadyExecutedOffer() public {
        uint256 dealId = _submitOffer(merchant, seller, _futureExpiry());

        vm.prank(seller);
        settlement.acceptOffer(dealId);

        vm.prank(seller);
        vm.expectRevert(BuyoutSettlement.DealNotPending.selector);
        settlement.acceptOffer(dealId);
    }

    function test_cannotAcceptCancelledOffer() public {
        uint256 dealId = _submitOffer(merchant, seller, _futureExpiry());

        vm.prank(merchant);
        settlement.cancelOffer(dealId);

        vm.prank(seller);
        vm.expectRevert(BuyoutSettlement.DealNotPending.selector);
        settlement.acceptOffer(dealId);
    }

    function test_nonMerchantCannotCancel() public {
        uint256 dealId = _submitOffer(merchant, seller, _futureExpiry());

        vm.prank(seller);
        vm.expectRevert(BuyoutSettlement.OnlyMerchant.selector);
        settlement.cancelOffer(dealId);
    }

    function test_cannotExpirePendingFutureOffer() public {
        uint256 dealId = _submitOffer(merchant, seller, _futureExpiry());

        vm.prank(other);
        vm.expectRevert(BuyoutSettlement.NotExpiredYet.selector);
        settlement.expireOffer(dealId);
    }

    function test_cannotAcceptNonexistentDeal() public {
        vm.prank(seller);
        vm.expectRevert(BuyoutSettlement.DealNotFound.selector);
        settlement.acceptOffer(9999);
    }

    function test_cannotSubmitZeroPayout() public {
        vm.prank(merchant);
        vm.expectRevert(BuyoutSettlement.ZeroAmount.selector);
        settlement.submitOffer({
            seller: seller,
            inputToken: address(token),
            inputAmount: INPUT_AMOUNT,
            payoutAmount: 0,
            expiresAt: _futureExpiry(),
            nonce: NONCE
        });
    }

    function test_cannotSubmitZeroSeller() public {
        vm.prank(merchant);
        vm.expectRevert(BuyoutSettlement.ZeroAmount.selector);
        settlement.submitOffer({
            seller: address(0),
            inputToken: address(token),
            inputAmount: INPUT_AMOUNT,
            payoutAmount: PAYOUT_AMOUNT,
            expiresAt: _futureExpiry(),
            nonce: NONCE
        });
    }

    // ========================================================================
    // ETH handling
    // ========================================================================

    function test_contractReceivesEth() public {
        uint256 initialBalance = address(settlement).balance;
        assertEq(initialBalance, 10 ether);

        vm.deal(address(this), 0);
        vm.deal(address(this), 0);
    }

    function test_cannotAcceptWithoutSufficientEth() public {
        // Deploy a contract with no ETH
        BuyoutSettlement poorSettlement = new BuyoutSettlement{value: 0 ether}();

        vm.prank(merchant);
        uint256 dealId = poorSettlement.submitOffer({
            seller: seller,
            inputToken: address(token),
            inputAmount: INPUT_AMOUNT,
            payoutAmount: 0.01 ether,
            expiresAt: _futureExpiry(),
            nonce: 1
        });

        // Give contract just enough to not cover payout
        vm.deal(address(poorSettlement), 0.005 ether);

        vm.prank(seller);
        vm.expectRevert(BuyoutSettlement.InsufficientContractBalance.selector);
        poorSettlement.acceptOffer(dealId);
    }

    // ========================================================================
    // Helper
    // ========================================================================

    function _submitOffer(
        address m,
        address s,
        uint256 expiry
    ) internal returns (uint256 dealId) {
        vm.prank(m);
        dealId = settlement.submitOffer({
            seller: s,
            inputToken: address(token),
            inputAmount: INPUT_AMOUNT,
            payoutAmount: PAYOUT_AMOUNT,
            expiresAt: expiry,
            nonce: NONCE
        });
    }
}
