// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {SavingsPool} from "../src/SavingsPool.sol";
import {SfBase} from "./SfBase.sol";

contract SavingsPoolTest is SfBase {
    SavingsPool internal pool;

    function setUp() public override {
        super.setUp();
        pool = new SavingsPool(address(allow), admin);
        _giveUsdcx(alice, 5_000e6);
        _giveUsdcx(bob, 5_000e6);
        _giveUsdcx(carol, 5_000e6);
        _approveToken(alice, address(usdcx), address(pool));
        _approveToken(bob, address(usdcx), address(pool));
        _approveToken(carol, address(usdcx), address(pool));
    }

    function test_sharesFinesAndFee() public {
        uint256 id = _club(100e18, 5e18, 5e18, 500e18);
        vm.prank(alice);
        pool.addMember(id, bob);
        vm.prank(alice);
        pool.deposit(id, 100e18);
        vm.prank(bob);
        pool.deposit(id, 100e18);

        assertEq(pool.protocolFees(address(usdcx)), 0.6e18);
        (uint256 shares,, uint256 principal, uint256 held,) = pool.books(id);
        assertEq(shares, 200e18);
        assertEq(principal, 0);
        assertEq(held, 200e18);
        assertEq(_bal(address(usdcx), address(pool)), held + pool.protocolFees(address(usdcx)));

        vm.warp(block.timestamp + 2 days + 1);
        pool.markLate(id, alice);
        assertEq(pool.getSeat(id, 0).fine, 5e18);

        vm.prank(alice);
        pool.payFine(id, 5e18);
        (, uint256 profit,, uint256 heldAfter,) = pool.books(id);
        assertEq(profit, 5e18);
        assertEq(heldAfter, 205e18);

        vm.prank(bob);
        vm.expectRevert(SavingsPool.NotProtocolAdmin.selector);
        pool.withdrawProtocolFees(address(usdcx), bob);
        vm.prank(admin);
        pool.withdrawProtocolFees(address(usdcx), admin);
        assertEq(pool.protocolFees(address(usdcx)), 0);
        assertEq(_bal(address(usdcx), admin), 0.6e18);

        vm.prank(alice);
        pool.closePool(id);
        vm.prank(alice);
        pool.shareProfit(id);
        assertEq(pool.getSeat(id, 0).shares, 102.5e18);
        assertEq(pool.getSeat(id, 1).shares, 102.5e18);
        uint256 bobBefore = _bal(address(usdcx), bob);
        vm.prank(bob);
        pool.withdraw(id, 102.5e18);
        assertEq(_bal(address(usdcx), bob) - bobBefore, 102.5e18);
    }

    function test_waiverNeedsASecondAdminAboveTheCap() public {
        uint256 id = _club(100e18, 10e18, 5e18, 500e18);
        vm.prank(alice);
        pool.addMember(id, bob);
        vm.prank(alice);
        pool.addAdmin(id, bob);
        vm.prank(alice);
        pool.deposit(id, 100e18);
        vm.warp(block.timestamp + 2 days + 1);
        pool.markLate(id, alice);
        assertEq(pool.getSeat(id, 0).fine, 10e18);

        vm.prank(alice);
        pool.waive(id, SavingsPool.WaiverKind.Fine, 0, 10e18);
        assertEq(pool.getSeat(id, 0).fine, 10e18);
        vm.prank(alice);
        vm.expectRevert(SavingsPool.BadState.selector);
        pool.waive(id, SavingsPool.WaiverKind.Fine, 0, 10e18);
        vm.prank(bob);
        pool.waive(id, SavingsPool.WaiverKind.Fine, 0, 10e18);
        assertEq(pool.getSeat(id, 0).fine, 0);

        vm.warp(block.timestamp + 1 days + 1);
        pool.markLate(id, alice);
        vm.prank(alice);
        vm.expectRevert(SavingsPool.BadParams.selector);
        pool.waive(id, SavingsPool.WaiverKind.Fine, 0, 5e18);
        assertEq(pool.getSeat(id, 0).fine, 10e18);
    }

    function test_loanLocksSharesAndPaysInterestToThePool() public {
        uint256 id = _club(100e18, 1e18, 20e18, 80e18);
        address dave = makeAddr("dave");
        vm.startPrank(alice);
        pool.addMember(id, bob);
        pool.addMember(id, carol);
        pool.addMember(id, dave);
        pool.addAdmin(id, carol);
        pool.addAdmin(id, dave);
        pool.deposit(id, 100e18);
        vm.stopPrank();
        vm.prank(bob);
        pool.deposit(id, 100e18);
        vm.prank(carol);
        pool.deposit(id, 100e18);

        vm.prank(alice);
        uint256 loanId = pool.proposeLoan(id, 150e18, bob);
        vm.prank(alice);
        vm.expectRevert(SavingsPool.BadState.selector);
        pool.approveLoan(id, loanId);
        vm.prank(carol);
        pool.approveLoan(id, loanId);
        vm.prank(alice);
        vm.expectRevert(SavingsPool.BadState.selector);
        pool.drawLoan(id, loanId);
        vm.prank(bob);
        pool.consentGuarantee(id, loanId);
        vm.prank(dave);
        pool.approveLoan(id, loanId);
        uint256 before = _bal(address(usdcx), alice);
        vm.prank(alice);
        pool.drawLoan(id, loanId);
        assertEq(_bal(address(usdcx), alice) - before, 150e18);
        assertEq(pool.getSeat(id, 0).locked, 100e18);
        assertEq(pool.getSeat(id, 1).locked, 50e18);

        vm.prank(alice);
        vm.expectRevert(SavingsPool.BadParams.selector);
        pool.withdraw(id, 1);

        uint256 interest = 15e18;
        vm.prank(alice);
        pool.waive(id, SavingsPool.WaiverKind.Interest, loanId, interest);
        assertEq(pool.getLoan(id, loanId).principalLeft, 150e18);
        assertEq(pool.getLoan(id, loanId).outstanding, 150e18);

        vm.prank(alice);
        pool.repay(id, loanId, 150e18);
        assertEq(pool.getSeat(id, 0).locked, 0);
        assertEq(pool.getSeat(id, 1).locked, 0);
        (, uint256 profit,,,) = pool.books(id);
        assertEq(profit, 0);
        assertTrue(pool.getLoan(id, loanId).closed);
    }

    function test_reserveStopsALoanThatWouldEmptyTheCash() public {
        uint256 id = _club(100e18, 1e18, 1e18, 1_000e18);
        vm.prank(alice);
        pool.addMember(id, bob);
        vm.prank(alice);
        pool.addAdmin(id, bob);
        vm.prank(alice);
        pool.deposit(id, 100e18);
        vm.prank(alice);
        uint256 loanId = pool.proposeLoan(id, 90e18, address(0));
        vm.prank(alice);
        vm.expectRevert(SavingsPool.BadState.selector);
        pool.approveLoan(id, loanId);
        vm.prank(bob);
        pool.approveLoan(id, loanId);
        vm.prank(alice);
        vm.expectRevert(SavingsPool.BadState.selector);
        pool.drawLoan(id, loanId);
    }

    function test_jointGoalPaysTheBeneficiaryOrRefunds() public {
        uint256 paid = _joint(false);
        vm.prank(alice);
        pool.deposit(paid, 60e18);
        vm.prank(bob);
        pool.deposit(paid, 40e18);
        vm.prank(alice);
        pool.consent(paid, true);
        vm.prank(alice);
        vm.expectRevert(SavingsPool.BadState.selector);
        pool.payBeneficiary(paid);
        vm.prank(bob);
        pool.consent(paid, true);
        uint256 school = _bal(address(usdcx), carol);
        pool.payBeneficiary(paid);
        assertEq(_bal(address(usdcx), carol) - school, 100e18);
        assertEq(pool.getSeat(paid, 0).shares, 0);

        uint256 viaTreasurer = _joint(true);
        vm.prank(alice);
        pool.deposit(viaTreasurer, 100e18);
        vm.prank(bob);
        vm.expectRevert(SavingsPool.NotAdmin.selector);
        pool.payBeneficiary(viaTreasurer);
        vm.prank(alice);
        pool.payBeneficiary(viaTreasurer);
        assertEq(pool.getPool(viaTreasurer).released, true);

        uint256 refunded = _joint(true);
        vm.prank(alice);
        pool.deposit(refunded, 60e18);
        vm.prank(bob);
        pool.deposit(refunded, 40e18);
        vm.prank(alice);
        pool.consent(refunded, false);
        vm.prank(bob);
        pool.consent(refunded, false);
        pool.openRefund(refunded);
        uint256 back = _bal(address(usdcx), alice);
        vm.prank(alice);
        pool.withdraw(refunded, 60e18);
        assertEq(_bal(address(usdcx), alice) - back, 60e18);
    }

    function test_individualPledges() public {
        vm.prank(alice);
        uint256 id = pool.createPool(_params(0, 1e18, 1e18, 1_000e18, SavingsPool.Kind.Club, SavingsPool.PledgeMode.Individual));
        vm.prank(alice);
        pool.setPledge(id, 25e18);
        vm.prank(alice);
        pool.deposit(id, 25e18);
        assertGt(pool.getSeat(id, 0).nextDue, block.timestamp + 1 days - 1);
        vm.warp(block.timestamp + 2 days);
        pool.markLate(id, alice);
        assertEq(pool.getSeat(id, 0).fine, 1e18);
    }

    function _club(uint128 pledge, uint128 fine, uint128 cap, uint128 twoAdminAt) internal returns (uint256 id) {
        vm.prank(alice);
        id = pool.createPool(_params(pledge, fine, cap, twoAdminAt, SavingsPool.Kind.Club, SavingsPool.PledgeMode.Fixed));
    }

    function _joint(bool treasurer) internal returns (uint256 id) {
        SavingsPool.CreateParams memory params =
            _params(0, 0, 0, 0, SavingsPool.Kind.Joint, SavingsPool.PledgeMode.Individual);
        params.target = 100e18;
        params.beneficiary = carol;
        params.reserveBps = 0;
        params.loanMultipleBps = 0;
        params.loanTerm = 0;
        if (treasurer) {
            params.releaseRule = SavingsPool.ReleaseRule.Treasurer;
            params.treasurer = alice;
        }
        vm.prank(alice);
        id = pool.createPool(params);
        vm.prank(alice);
        pool.addMember(id, bob);
    }

    function _params(
        uint128 pledge,
        uint128 fine,
        uint128 cap,
        uint128 twoAdminAt,
        SavingsPool.Kind kind,
        SavingsPool.PledgeMode mode
    ) internal view returns (SavingsPool.CreateParams memory params) {
        params.token = address(usdcx);
        params.kind = kind;
        params.pledgeMode = mode;
        params.fixedPledge = pledge;
        params.lateFine = fine;
        params.waiveCap = cap;
        params.twoAdminAt = twoAdminAt;
        params.loanMultipleBps = 20_000;
        params.interestBps = 1_000;
        params.reserveBps = kind == SavingsPool.Kind.Club ? 2_000 : 0;
        params.period = 1 days;
        params.loanTerm = 7 days;
    }
}
