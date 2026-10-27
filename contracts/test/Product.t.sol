// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {SfBase} from "./SfBase.sol";
import {FlowVault} from "../src/FlowVault.sol";
import {FlowVaultStore} from "../src/FlowVaultStore.sol";
import {LockVault} from "../src/LockVault.sol";
import {GroupRotationStore} from "../src/GroupRotationStore.sol";
import {GroupRotation, IGroupCalls} from "../src/GroupRotation.sol";

/// @notice The contract behaviors that make a savings plan, a lock, and a group
///         completable from a wallet call, without a keeper.
contract ProductTest is SfBase {
    function test_penaltyIsCopiedOntoTheLock() public {
        _giveUsdcx(alice, 10_000e6);
        _approveToken(alice, address(usdcx), address(locks));
        vm.prank(alice);
        uint256 id = locks.lock(address(usdcx), 1_000e18, 7 days, false);
        vm.prank(admin);
        locks.setPenaltyBps(1_000);
        vm.prank(alice);
        (, uint256 penalty) = locks.breakEarly(id);
        assertEq(penalty, 30e18);
    }

    function test_savingGoalHoldsAndReturnsTheDeposit() public {
        FlowVault vault = _open(alice);
        _depositUnderlying(vault, alice, usdc, usdcx, USDC_FUND);
        uint256 idle = vault.unallocated(address(usdcx));
        uint256 wallet = _bal(address(usdcx), alice);
        vm.prank(alice);
        uint256 id = vault.openSavings(address(usdcx), 500e18, 7 days, bytes32("rent"), 2_000e18);
        FlowVaultStore.Flow memory held = vault.getFlow(id);
        assertEq(held.conduit, address(0));
        assertEq(held.liveRate, 0);
        assertTrue(held.active);
        assertEq(_bal(address(usdcx), alice), wallet);
        (uint256 saved, uint256 target,, bool holding) = vault.progress(id);
        assertEq(saved, held.reserved);
        assertEq(target, 2_000e18);
        assertTrue(holding);

        vm.prank(alice);
        vault.topUp(id, 100e18);
        vm.prank(alice);
        vault.release(id, 50e18);
        assertEq(vault.unallocated(address(usdcx)), idle - held.reserved - 100e18 + 50e18);

        uint256 end = vm.getBlockTimestamp() + 7 days;
        vm.warp(end);
        vault.protect(address(usdcx));
        assertTrue(vault.getFlow(id).settled);
        assertEq(vault.unallocated(address(usdcx)), idle);
        _assertSolvent(address(usdcx), address(vault));
    }

    function test_recoverSurplusLeavesAnActiveStreamAlone() public {
        FlowVault vault = _open(alice);
        _depositUnderlying(vault, alice, usdc, usdcx, USDC_FUND);
        uint256 id = _create(
            vault, alice, _params(address(usdcx), bob, FlowVaultStore.FlowKind.Expense, 100e18, 0, 1 days, 0, false, 0, FlowVaultStore.ChainMode.None, false)
        );
        vm.prank(alice);
        vault.activate(id);
        uint256 idle = vault.unallocated(address(usdcx));
        _giveUsdcx(carol, 1_000e6);
        vm.prank(carol);
        usdcx.transfer(address(vault), 25e18);
        vm.prank(alice);
        vault.recoverSurplus(address(usdcx));
        assertEq(vault.unallocated(address(usdcx)), idle + 25e18);
        assertGt(cfaFwd.getFlowrate(address(usdcx), address(vault), vault.getFlow(id).conduit), 0);
        _assertSolvent(address(usdcx), address(vault));
    }

    function test_pauseResumeKeepsTheUnstreamedBalance() public {
        FlowVault vault = _open(alice);
        _depositUnderlying(vault, alice, usdc, usdcx, USDC_FUND);
        uint256 id = _create(
            vault, alice, _params(address(usdcx), bob, FlowVaultStore.FlowKind.Expense, 86_400e18, 0, 1 days, 0, false, 0, FlowVaultStore.ChainMode.None, false)
        );
        vm.prank(alice);
        vault.activate(id);
        uint256 t0 = vm.getBlockTimestamp();
        vm.warp(t0 + 1 hours);
        vm.prank(alice);
        vault.pause(id);
        assertEq(vault.getFlow(id).conduit, address(0));
        assertEq(cfaFwd.getAccountFlowrate(address(usdcx), address(vault)), 0);

        vm.warp(t0 + 3 days);
        _assertSolvent(address(usdcx), address(vault));
        vm.prank(alice);
        vault.resume(id);
        address conduit = vault.getFlow(id).conduit;
        assertGt(cfaFwd.getFlowrate(address(usdcx), conduit, bob), 0);
        uint256 end = vault.getFlow(id).end;
        vm.warp(end);
        vault.settle(id);
        assertTrue(vault.getFlow(id).settled);
        _assertSolvent(address(usdcx), address(vault));
    }

    function test_flowGoalSettlesWhenTheGoalHasStreamed() public {
        FlowVault vault = _open(alice);
        _depositUnderlying(vault, alice, usdc, usdcx, USDC_FUND);
        uint256 id = _create(
            vault,
            alice,
            _params(address(usdcx), bob, FlowVaultStore.FlowKind.FlowGoal, 100e18, 0, 10 days, 10e18, false, 0, FlowVaultStore.ChainMode.None, false)
        );
        vm.prank(alice);
        vault.activate(id);
        uint256 t0 = vm.getBlockTimestamp();
        vm.warp(t0 + 2 days);
        vault.settle(id);
        assertTrue(vault.getFlow(id).settled);
        assertGt(_bal(address(usdcx), bob), 0);
        _assertSolvent(address(usdcx), address(vault));
    }

    function test_settledFlowFreesASlot() public {
        FlowVault vault = _open(alice);
        _depositUnderlying(vault, alice, usdc, usdcx, USDC_FUND);
        uint256 first;
        for (uint256 i; i < 64; ++i) {
            uint256 id = _create(
                vault,
                alice,
                _params(address(usdcx), bob, FlowVaultStore.FlowKind.Expense, 1e18, 0, 1 days, 0, false, 0, FlowVaultStore.ChainMode.None, false)
            );
            if (i == 0) first = id;
        }
        vm.expectRevert(FlowVaultStore.TooManyFlows.selector);
        _create(
            vault, alice, _params(address(usdcx), bob, FlowVaultStore.FlowKind.Expense, 1e18, 0, 1 days, 0, false, 0, FlowVaultStore.ChainMode.None, false)
        );
        vm.prank(alice);
        vault.cancel(first);
        _create(
            vault, alice, _params(address(usdcx), bob, FlowVaultStore.FlowKind.Expense, 1e18, 0, 1 days, 0, false, 0, FlowVaultStore.ChainMode.None, false)
        );
    }

    function test_memberCanLeaveBeforeTheGroupStarts() public {
        address[] memory members = _members(4, "leave");
        uint256 id = _draft(members, 10e18, 1 hours, 20 minutes, 5 minutes, 2);
        uint256 posted = _bal(address(usdcx), members[3]);
        vm.prank(members[3]);
        IGroupCalls(address(groups)).exitBeforeStart(id);
        assertEq(_memberCount(id), 3);
        assertGt(_bal(address(usdcx), members[3]), posted);
        vm.prank(members[0]);
        groups.start(id);

        address[] memory small = _members(3, "short");
        uint256 stuck = _draft(small, 10e18, 1 hours, 20 minutes, 5 minutes, 2);
        vm.prank(small[2]);
        IGroupCalls(address(groups)).exitBeforeStart(stuck);
        vm.expectRevert(GroupRotationStore.BadParams.selector);
        vm.prank(small[0]);
        groups.start(stuck);

        address[] memory handed = _members(4, "hand");
        uint256 next = _draft(handed, 10e18, 1 hours, 20 minutes, 5 minutes, 2);
        vm.prank(handed[0]);
        IGroupCalls(address(groups)).exitBeforeStart(next);
        vm.prank(handed[1]);
        groups.start(next);
        assertTrue(_started(next));
    }

    function test_pauseFreezesTheGroupClock() public {
        address[] memory members = _members(3, "freeze");
        uint256 id = _draft(members, 10e18, 1 hours, 20 minutes, 5 minutes, 2);
        vm.prank(members[0]);
        groups.start(id);
        uint256 collateral = IGroupCalls(address(groups)).getMember(id, 1).collateral;
        groups.setGroupPaused(id, true);
        uint256 t0 = vm.getBlockTimestamp();
        vm.warp(t0 + 2 hours);
        groups.sync(id);
        assertEq(IGroupCalls(address(groups)).getMember(id, 1).collateral, collateral);
        groups.setGroupPaused(id, false);
        vm.prank(members[1]);
        groups.contribute(id);
        assertEq(IGroupCalls(address(groups)).getMember(id, 1).given, 10e18);
    }

    function test_recipientCanTakeThePotAsALump() public {
        address[] memory members = _members(3, "lump");
        uint256 id = _live(members, 10e18, 1 hours, 20 minutes, 5 minutes, 1);
        for (uint256 i; i < 3; ++i) {
            vm.prank(members[i]);
            groups.contribute(id);
        }
        uint256 before = _bal(address(usdcx), members[0]);
        vm.prank(members[0]);
        groups.claimPayout(id);
        assertGt(_bal(address(usdcx), members[0]), before);
        assertEq(_rate(id), 0);
        _assertSolvent(address(usdcx), address(groups));
    }

    function test_yieldCannotSpendLockedPrincipal() public {
        _giveUsdcx(alice, 10_000e6);
        _approveToken(alice, address(usdcx), address(locks));
        vm.prank(admin);
        locks.setYieldPerTokenPerSecond(address(usdcx), 1e9);
        _giveUsdcx(admin, 10_000e6);
        _approveToken(admin, address(usdcx), address(locks));
        vm.prank(admin);
        locks.fundYield(address(usdcx), 1e18);
        vm.prank(alice);
        uint256 id = locks.lock(address(usdcx), 1_000e18, 7 days, true);
        assertGt(cfaFwd.getFlowrate(address(usdcx), address(locks.yieldPayer()), alice), 0);
        uint256 t0 = vm.getBlockTimestamp();
        vm.warp(t0 + 30 days);
        vm.prank(alice);
        (uint256 payout,) = locks.withdrawMature(id);
        assertGe(payout, 1_000e18);
        _assertSolvent(address(usdcx), address(locks));
    }

    function _memberCount(uint256 id) internal view returns (uint16 memberCount) {
        (,,,,,,,,,, memberCount,,,,,,,,,,) = groups.groups(id);
    }

    function _started(uint256 id) internal view returns (bool started) {
        (,,,,,,,,,,, started,,,,,,,,,) = groups.groups(id);
    }

    function _rate(uint256 id) internal view returns (int96 rate) {
        (,,,,,,,,,,,,,,,, rate,,,,) = groups.groups(id);
    }

    function _draft(
        address[] memory members,
        uint128 contribution,
        uint64 cycle,
        uint64 window,
        uint64 grace,
        uint16 totalCycles
    ) internal returns (uint256 id) {
        for (uint256 i; i < members.length; ++i) {
            _giveUsdcx(members[i], 1_000e6);
            _approveToken(members[i], address(usdcx), address(groups));
        }
        vm.prank(members[0]);
        id = groups.createGroup(address(usdcx), contribution, cycle, window, grace, totalCycles, members, _zeroOffsets(members.length));
        for (uint256 i; i < members.length; ++i) {
            vm.prank(members[i]);
            groups.postCollateral(id);
        }
    }

    function _live(
        address[] memory members,
        uint128 contribution,
        uint64 cycle,
        uint64 window,
        uint64 grace,
        uint16 totalCycles
    ) internal returns (uint256 id) {
        id = _draft(members, contribution, cycle, window, grace, totalCycles);
        vm.prank(members[0]);
        groups.start(id);
        for (uint256 i; i < members.length; ++i) {
            vm.prank(members[i]);
            groups.connect(id);
        }
    }
}
