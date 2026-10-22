// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ISuperfluid, ISuperToken} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {SfBase} from "./SfBase.sol";
import {BalanceToken} from "./mocks/Mocks.sol";
import {GroupRotation} from "../src/GroupRotation.sol";
import {FlowVault} from "../src/FlowVault.sol";
import {ITokenAllowlist} from "../src/interfaces/ITokenAllowlist.sol";

contract GroupRotationTest is SfBase {
    function test_poolStreamsToTheMember() public {
        address[] memory members = _members(3, "stream");
        uint256 id = _startGroup(members, 10e18, 1 hours, 20 minutes, 10 minutes, 1, _zeroOffsets(3), 1_000e6);
        uint256 t0 = vm.getBlockTimestamp();
        for (uint256 i; i < 3; ++i) {
            vm.prank(members[i]);
            groups.contribute(id);
        }
        address pool = groups.poolOf(id);
        assertGt(gdaFwd.getFlowDistributionFlowRate(address(usdcx), address(groups), pool), 0);
        assertEq(_recipient(id, 0), members[0]);
        uint256 before = _bal(address(usdcx), members[0]);
        vm.warp(t0 + 10 minutes);
        groups.sync(id);
        groups.protect(id);
        _assertSolvent(address(usdcx), address(groups));
        assertGt(_bal(address(usdcx), members[0]), before);
        vm.prank(members[0]);
        assertTrue(groups.claimStream(id));
        vm.warp(t0 + 1 hours);
        groups.finalize(id);
        _assertSolvent(address(usdcx), address(groups));
        vm.prank(members[1]);
        assertGt(groups.claimCollateral(id), 0);
    }

    function test_threeMemberRotationMissAndLate() public {
        address[] memory members = _members(3, "rot3");
        uint64[] memory offsets = new uint64[](3);
        offsets[0] = 0;
        offsets[1] = 40 minutes;
        offsets[2] = 80 minutes;
        uint256 id = _startGroup(members, 5e18, 2 hours, 20 minutes, 10 minutes, 3, offsets, 1_000e6);
        uint256 t0 = vm.getBlockTimestamp();

        vm.expectRevert(GroupRotation.TooEarly.selector);
        vm.prank(members[1]);
        groups.contribute(id);
        _pay(id, members[0], t0);
        vm.expectRevert(GroupRotation.AlreadyPaid.selector);
        vm.prank(members[0]);
        groups.contribute(id);
        _pay(id, members[1], t0 + 40 minutes);
        vm.warp(t0 + 80 minutes + 20 minutes + 1);
        vm.prank(members[2]);
        groups.contribute(id);
        (, uint64 paidAt, GroupRotation.PayStatus status) = groups.payments(id, 0, 2);
        assertEq(uint8(status), uint8(GroupRotation.PayStatus.Late));
        assertGt(paidAt, 0);
        _assertSolvent(address(usdcx), address(groups));
        assertEq(_streamingTo(id), members[0]);
        assertGt(_flowRate(id), 0);

        uint256 cycle1 = t0 + 2 hours;
        _pay(id, members[0], cycle1);
        uint256 slashAt = cycle1 + 40 minutes + 20 minutes + 10 minutes + 1;
        vm.warp(slashAt);
        uint256 collateralBefore = groups.getMember(id, 1).collateral;
        groups.settleMissed(id, 1, 1);
        assertEq(groups.getMember(id, 1).collateral, collateralBefore - 5e18);
        (uint256 funded,,) = groups.pots(id, 1);
        assertGt(funded, 0);
        groups.sync(id);
        _assertSolvent(address(usdcx), address(groups));
        // Member 1 missed their window, so their round moves immediately.
        assertEq(_streamingTo(id), members[2]);
        assertEq(groups.recipientOf(id, 1), members[1]);
        assertEq(groups.owedFromTo(id, members[1], members[2]), 5e18);
        _pay(id, members[2], cycle1 + 80 minutes);

        uint256 cycle2 = t0 + 4 hours;
        _pay(id, members[0], cycle2);
        _pay(id, members[1], cycle2 + 40 minutes);
        _pay(id, members[2], cycle2 + 80 minutes);
        vm.warp(t0 + 6 hours);
        groups.finalize(id);
        _assertSolvent(address(usdcx), address(groups));
        for (uint256 i; i < 3; ++i) {
            if (groups.getMember(id, i).collateral > 0) {
                vm.prank(members[i]);
                groups.claimCollateral(id);
            }
        }
    }

    function test_sevenMemberDifferentCycle() public {
        address[] memory members = _members(7, "rot7");
        uint64[] memory offsets = new uint64[](7);
        for (uint256 i; i < 7; ++i) {
            offsets[i] = uint64(i * 20 minutes);
        }
        uint256 id = _startGroup(members, 2e18, 4 hours, 15 minutes, 5 minutes, 2, offsets, 500e6);
        uint256 t0 = vm.getBlockTimestamp();
        for (uint256 c; c < 2; ++c) {
            for (uint256 i; i < 7; ++i) {
                _pay(id, members[i], t0 + c * 4 hours + offsets[i]);
            }
            _assertSolvent(address(usdcx), address(groups));
            assertEq(_streamingTo(id), members[c]);
            assertGt(_flowRate(id), 0);
        }
        vm.warp(t0 + 8 hours);
        groups.finalize(id);
        _assertSolvent(address(usdcx), address(groups));
    }

    function test_crowdOfTenAndFifty() public {
        _crowd(10, 2, "ten");
        _crowd(50, 1, "fifty");
    }

    function test_cancelAndRejections() public {
        address[] memory members = _members(3, "rej");
        for (uint256 i; i < 3; ++i) {
            _giveUsdcx(members[i], 100e6);
            _approveToken(members[i], address(usdcx), address(groups));
        }
        uint64[] memory offsets = _zeroOffsets(3);
        vm.expectRevert(GroupRotation.BadParams.selector);
        vm.prank(members[0]);
        groups.createGroup(address(usdcx), 0, 1 hours, 10 minutes, 0, 1, members, offsets);
        address[] memory small = _members(2, "small");
        vm.expectRevert(GroupRotation.BadParams.selector);
        vm.prank(small[0]);
        groups.createGroup(address(usdcx), 1e18, 1 hours, 10 minutes, 0, 1, small, _zeroOffsets(2));
        address[] memory big = _members(51, "big");
        vm.expectRevert(GroupRotation.BadParams.selector);
        vm.prank(big[0]);
        groups.createGroup(address(usdcx), 1, 1 hours, 10 minutes, 0, 1, big, _zeroOffsets(51));
        vm.expectRevert(GroupRotation.BadParams.selector);
        vm.prank(members[0]);
        groups.createGroup(address(usdcx), 1e18, 1 hours, 10 minutes, 0, 0, members, offsets);
        vm.expectRevert(GroupRotation.BadParams.selector);
        vm.prank(members[0]);
        groups.createGroup(address(usdcx), 1e18, 1 hours, 10 minutes, 0, 521, members, offsets);
        vm.expectRevert(GroupRotation.BadParams.selector);
        vm.prank(members[0]);
        groups.createGroup(address(usdcx), 1e18, 59 minutes, 10 minutes, 0, 1, members, offsets);
        vm.expectRevert(GroupRotation.WindowOutOfRange.selector);
        vm.prank(members[0]);
        groups.createGroup(address(usdcx), 1e18, 1 hours, 50 minutes, 20 minutes, 1, members, offsets);
        address[] memory dup = new address[](3);
        dup[0] = members[0];
        dup[1] = members[1];
        dup[2] = members[1];
        vm.expectRevert(GroupRotation.DuplicateMember.selector);
        vm.prank(members[0]);
        groups.createGroup(address(usdcx), 1e18, 1 hours, 10 minutes, 0, 1, dup, offsets);
        address[] memory outsider = new address[](3);
        outsider[0] = members[1];
        outsider[1] = members[2];
        outsider[2] = carol;
        vm.expectRevert(GroupRotation.CreatorNotMember.selector);
        vm.prank(alice);
        groups.createGroup(address(usdcx), 1e18, 1 hours, 10 minutes, 0, 1, outsider, offsets);
        address[] memory zeroed = new address[](3);
        zeroed[0] = members[0];
        zeroed[1] = address(0);
        zeroed[2] = members[2];
        vm.expectRevert(GroupRotation.ZeroAddress.selector);
        vm.prank(members[0]);
        groups.createGroup(address(usdcx), 1e18, 1 hours, 10 minutes, 0, 1, zeroed, offsets);
        vm.expectRevert(GroupRotation.BadParams.selector);
        vm.prank(members[0]);
        groups.createGroup(address(usdcx), type(uint128).max, 1 hours, 10 minutes, 0, 2, members, offsets);
        vm.expectRevert(GroupRotation.TokenNotAllowed.selector);
        vm.prank(members[0]);
        groups.createGroup(address(dai), 1e18, 1 hours, 10 minutes, 0, 1, members, offsets);

        vm.prank(admin);
        allow.setPaused(true);
        vm.expectRevert(GroupRotation.Paused.selector);
        vm.prank(members[0]);
        groups.createGroup(address(usdcx), 1e18, 1 hours, 10 minutes, 0, 1, members, offsets);
        vm.prank(admin);
        allow.setPaused(false);

        vm.prank(members[0]);
        uint256 id = groups.createGroup(address(usdcx), 1e18, 1 hours, 10 minutes, 5 minutes, 1, members, offsets);
        vm.expectRevert(GroupRotation.NotMember.selector);
        vm.prank(alice);
        groups.postCollateral(id);
        vm.prank(members[0]);
        groups.postCollateral(id);
        vm.expectRevert(GroupRotation.AlreadyPosted.selector);
        vm.prank(members[0]);
        groups.postCollateral(id);
        vm.expectRevert(GroupRotation.NotCreator.selector);
        vm.prank(members[1]);
        groups.start(id);
        vm.expectRevert(GroupRotation.MissingCollateral.selector);
        vm.prank(members[0]);
        groups.start(id);
        vm.prank(members[0]);
        groups.cancelBeforeStart(id);
        vm.expectRevert(GroupRotation.BadState.selector);
        vm.prank(members[0]);
        groups.start(id);
        vm.prank(members[0]);
        groups.claimCollateral(id);
        assertEq(groups.groupsOf(members[0]).length, 1);
        (uint256 cycle, bool open) = groups.currentCycle(id);
        assertEq(cycle, 0);
        assertFalse(open);
        vm.expectRevert(GroupRotation.BadCycle.selector);
        groups.recipientOf(id, 5);
        vm.expectRevert(GroupRotation.BadState.selector);
        vm.prank(members[0]);
        groups.connect(id);
        vm.expectRevert(GroupRotation.BadState.selector);
        groups.claimStream(id + 99);

        BalanceToken fee = new BalanceToken();
        fee.configure(address(0), false, 1);
        vm.prank(admin);
        allow.setSuperToken(address(fee), true, ITokenAllowlist.TokenKind.Pure);
        fee.mint(members[0], 100e18);
        vm.prank(members[0]);
        uint256 fid = groups.createGroup(address(fee), 10e18, 1 hours, 10 minutes, 0, 1, members, offsets);
        vm.expectRevert(GroupRotation.FeeOnTransfer.selector);
        vm.prank(members[0]);
        groups.postCollateral(fid);
    }

    function test_missWhileWindowOpenAndFinalizeMisses() public {
        address[] memory members = _members(3, "miss");
        uint256 id = _startGroup(members, 1e18, 1 hours, 10 minutes, 5 minutes, 1, _zeroOffsets(3), 100e6);
        uint256 t0 = vm.getBlockTimestamp();
        vm.prank(members[0]);
        groups.contribute(id);
        vm.expectRevert(GroupRotation.AlreadyPaid.selector);
        vm.prank(members[0]);
        groups.contribute(id);
        vm.expectRevert(GroupRotation.StillOpen.selector);
        groups.settleMissed(id, 0, 1);
        vm.warp(t0 + 10 minutes + 5 minutes + 1);
        // Paying after the window records the miss and repays the person whose round it is.
        vm.prank(members[1]);
        groups.contribute(id);
        assertEq(groups.paidFromTo(id, members[1], members[0]), 1e18);
        assertEq(groups.owedFromTo(id, members[1], members[0]), 0);
        assertEq(groups.owedFromTo(id, members[2], members[0]), 1e18);
        vm.expectRevert(GroupRotation.AlreadyPaid.selector);
        groups.settleMissed(id, 0, 1);
        vm.expectRevert(GroupRotation.AlreadyPaid.selector);
        groups.settleMissed(id, 0, 2);
        vm.expectRevert(GroupRotation.AlreadyPaid.selector);
        groups.settleMissed(id, 0, 1);
        vm.expectRevert(GroupRotation.BadMember.selector);
        groups.settleMissed(id, 0, 9);
        vm.expectRevert(GroupRotation.BadCycle.selector);
        groups.settleMissed(id, 3, 0);
        vm.warp(t0 + 1 hours);
        vm.expectRevert(GroupRotation.CycleOver.selector);
        vm.prank(members[0]);
        groups.contribute(id);
        groups.finalize(id);
        vm.expectRevert(GroupRotation.BadState.selector);
        groups.finalize(id);
        _assertSolvent(address(usdcx), address(groups));
        vm.expectRevert(GroupRotation.NothingToClaim.selector);
        vm.prank(members[2]);
        groups.claimCollateral(id);
    }

    function test_sixMembersWhoPaidWhom() public {
        address[] memory members = _members(6, "six");
        uint64[] memory offsets = new uint64[](6);
        for (uint256 i; i < 6; ++i) {
            offsets[i] = uint64(i * 8 minutes);
        }
        uint256 id = _startGroup(members, 1e18, 1 hours, 5 minutes, 2 minutes, 2, offsets, 500e6);
        uint256 t0 = vm.getBlockTimestamp();

        for (uint256 i; i < 6; ++i) {
            if (i == 3) continue;
            _pay(id, members[i], t0 + offsets[i]);
        }
        // Member 3 pays during member 5's window, after member 3's own interval.
        _pay(id, members[3], t0 + offsets[5]);

        GroupRotation.Books memory late = groups.ledger(id, 3);
        assertEq(late.given, 1e18);
        assertEq(late.owed, 0);
        assertEq(late.missed, 1);
        assertFalse(late.inOwe);
        assertEq(uint8(groups.place(id, 3)), uint8(GroupRotation.Place.Missed));
        // The money is booked to member 0, whose round it was, not to member 5.
        assertEq(groups.paidFromTo(id, members[3], members[0]), 1e18);
        assertEq(groups.paidFromTo(id, members[3], members[5]), 0);
        assertEq(groups.owedFromTo(id, members[3], members[5]), 0);
        assertEq(groups.paidFromTo(id, members[5], members[0]), 1e18);
        assertGt(groups.ledger(id, 0).received, 0);

        bool sawSlash;
        bool sawRepay;
        uint256 legs = groups.legCount(id);
        for (uint256 i; i < legs; ++i) {
            GroupRotation.Leg memory leg = groups.legAt(id, i);
            if (leg.from != members[3]) continue;
            assertEq(leg.to, members[0]);
            if (leg.kind == GroupRotation.PayStatus.Slashed) sawSlash = true;
            if (leg.kind == GroupRotation.PayStatus.Repaid) sawRepay = true;
        }
        assertTrue(sawSlash);
        assertTrue(sawRepay);

        uint256 cycle1 = t0 + 1 hours;
        _pay(id, members[0], cycle1);
        vm.warp(cycle1 + 15 minutes + 1);
        groups.catchUp(id);
        assertTrue(groups.ledger(id, 1).inOwe);
        assertEq(groups.owedFromTo(id, members[1], members[2]), 1e18);
        assertEq(groups.recipientOf(id, 1), members[1]);
        assertEq(groups.activeRecipient(id, 1), members[2]);
        assertEq(_streamingTo(id), members[2]);

        groups.setGroupPaused(id, true);
        vm.expectRevert(GroupRotation.Paused.selector);
        vm.prank(members[2]);
        groups.contribute(id);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, members[0]));
        vm.prank(members[0]);
        groups.setGroupPaused(id, false);
        groups.setGroupPaused(id, false);
        _assertSolvent(address(usdcx), address(groups));
    }

    function test_samePersonGroupAndSixFlowsOneToken() public {
        address[] memory members = new address[](3);
        members[0] = alice;
        members[1] = bob;
        members[2] = carol;
        uint256 groupId = _startGroup(members, 1e18, 1 hours, 20 minutes, 5 minutes, 1, _zeroOffsets(3), 1_000e6);
        uint256 t0 = vm.getBlockTimestamp();
        for (uint256 i; i < 3; ++i) {
            vm.prank(members[i]);
            groups.contribute(groupId);
        }
        assertEq(_streamingTo(groupId), alice);

        FlowVault vault = _open(alice);
        _depositUnderlying(vault, alice, usdc, usdcx, USDC_FUND);
        uint256 expense = _create(
            vault, alice, _params(address(usdcx), bob, FlowVault.FlowKind.Expense, 100e18, 0, 1 days, 0, true, 0, FlowVault.ChainMode.None, false)
        );
        uint256 sub = _sub(vault, alice, expense, carol, FlowVault.FlowKind.Expense, FlowVault.RateMode.Share, 0, 2_000, 0, false);
        uint256[] memory ids = new uint256[](6);
        ids[0] = expense;
        ids[1] = _create(
            vault, alice, _params(address(usdcx), carol, FlowVault.FlowKind.Expense, 80e18, 0, 1 days, 0, false, 0, FlowVault.ChainMode.None, false)
        );
        ids[2] = _create(
            vault, alice, _params(address(usdcx), alice, FlowVault.FlowKind.SavingGoal, 50e18, 0, 1 days, 1e15, false, 0, FlowVault.ChainMode.None, false)
        );
        ids[3] = _create(
            vault, alice, _params(address(usdcx), alice, FlowVault.FlowKind.SavingGoal, 40e18, 0, 1 days, 1e15, false, 0, FlowVault.ChainMode.None, false)
        );
        ids[4] = _create(
            vault, alice, _params(address(usdcx), bob, FlowVault.FlowKind.FlowGoal, 30e18, 0, 1 days, 1e15, false, 0, FlowVault.ChainMode.None, false)
        );
        ids[5] = _create(
            vault,
            alice,
            _params(address(usdcx), carol, FlowVault.FlowKind.Expense, 20e18, uint64(t0 + 1 hours), 1 days, 0, false, 0, FlowVault.ChainMode.None, false)
        );

        for (uint256 i; i < 5; ++i) {
            vm.prank(alice);
            vault.activate(ids[i]);
            assertEq(vault.getFlow(ids[i]).token, address(usdcx));
        }
        assertEq(vault.getFlow(sub).token, address(usdcx));
        assertTrue(vault.getFlow(ids[2]).conduit != vault.getFlow(ids[3]).conduit);
        assertGt(cfaFwd.getFlowrate(address(usdcx), vault.getFlow(ids[2]).conduit, alice), 0);
        assertGt(cfaFwd.getFlowrate(address(usdcx), vault.getFlow(ids[3]).conduit, alice), 0);

        vm.warp(t0 + 30 minutes);
        groups.sync(groupId);
        vault.protect(address(usdcx));
        assertGt(_bal(address(usdcx), alice), 0);
        assertGt(_bal(address(usdcx), bob), 0);
        assertEq(_streamingTo(groupId), alice);
        _assertSolvent(address(usdcx), address(vault));
        _assertSolvent(address(usdcx), address(groups));
        _assertSolvent(address(usdcx), alice);

        vm.expectRevert(FlowVault.TooEarly.selector);
        vault.activate(ids[5]);
        vm.warp(t0 + 1 hours);
        vm.prank(alice);
        vault.activate(ids[5]);
        assertEq(vault.flowCount(), 7);
        _assertSolvent(address(usdcx), address(vault));
        _assertSolvent(address(usdcx), address(groups));
    }

    function test_liquidationPeriodFallback() public {
        address[] memory members = _members(3, "ppp");
        uint256 id = _startGroup(members, 1e18, 1 hours, 20 minutes, 0, 1, _zeroOffsets(3), 100e6);
        vm.prank(members[0]);
        groups.contribute(id);
        vm.prank(address(sfDeployer));
        sf.governance.clearPPPConfig(ISuperfluid(address(sf.host)), ISuperToken(address(0)));
        groups.sync(id);
        _assertSolvent(address(usdcx), address(groups));
    }

    function testFuzz_groupDoesNotGoCritical(uint64 cycleSeed, uint96 contribSeed) public {
        uint64 cycle = uint64(bound(cycleSeed, 1 hours, 6 hours));
        uint128 contribution = uint128(bound(contribSeed, 1e18, 20e18));
        uint64 window = cycle / 4;
        uint64 grace = cycle / 8;
        address[] memory members = _members(3, "fuzz");
        uint256 id = _startGroup(members, contribution, cycle, window, grace, 1, _zeroOffsets(3), 10_000e6);
        uint256 t0 = vm.getBlockTimestamp();
        for (uint256 i; i < 3; ++i) {
            vm.prank(members[i]);
            groups.contribute(id);
        }
        vm.warp(t0 + cycle / 2);
        groups.protect(id);
        _assertSolvent(address(usdcx), address(groups));
        vm.warp(t0 + cycle);
        groups.finalize(id);
        _assertSolvent(address(usdcx), address(groups));
    }

    function _startGroup(
        address[] memory members,
        uint128 contribution,
        uint64 cycle,
        uint64 window,
        uint64 grace,
        uint16 totalCycles,
        uint64[] memory offsets,
        uint256 funding
    ) internal returns (uint256 id) {
        for (uint256 i; i < members.length; ++i) {
            _giveUsdcx(members[i], funding);
            _approveToken(members[i], address(usdcx), address(groups));
        }
        vm.prank(members[0]);
        id = groups.createGroup(address(usdcx), contribution, cycle, window, grace, totalCycles, members, offsets);
        for (uint256 i; i < members.length; ++i) {
            vm.prank(members[i]);
            groups.postCollateral(id);
        }
        vm.prank(members[0]);
        groups.start(id);
        for (uint256 i; i < members.length; ++i) {
            vm.prank(members[i]);
            assertTrue(groups.connect(id));
        }
        assertTrue(_connected(groups.poolOf(id), members[0]));
        assertFalse(_connected(groups.poolOf(id), address(groups)));
    }

    function _pay(uint256 id, address member, uint256 moment) internal {
        vm.warp(moment);
        vm.prank(member);
        groups.contribute(id);
    }

    function _crowd(uint256 n, uint16 cycles, string memory salt) internal {
        address[] memory members = _members(n, salt);
        uint256 id = _startGroup(members, 1e18, 1 hours, 30 minutes, 5 minutes, cycles, _zeroOffsets(n), 200e6);
        uint256 t0 = vm.getBlockTimestamp();
        for (uint256 c; c < cycles; ++c) {
            if (c > 0) vm.warp(t0 + c * 1 hours);
            for (uint256 i; i < n; ++i) {
                vm.prank(members[i]);
                groups.contribute(id);
            }
            _assertSolvent(address(usdcx), address(groups));
            assertEq(_streamingTo(id), members[c % n]);
            assertGt(_flowRate(id), 0);
        }
        vm.warp(t0 + uint256(cycles) * 1 hours);
        groups.finalize(id);
        _assertSolvent(address(usdcx), address(groups));
    }

    function _connected(address pool, address member) internal view returns (bool) {
        (bool ok, bytes memory data) = address(gdaFwd).staticcall(
            abi.encodeWithSignature("isMemberConnected(address,address)", pool, member)
        );
        return ok && data.length >= 32 && abi.decode(data, (bool));
    }

    function _flowRate(uint256 id) internal view returns (int96 rate) {
        (
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            rate,
            ,
            ,
        ) = groups.groups(id);
    }

    function _streamingTo(uint256 id) internal view returns (address streamingTo) {
        (
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            streamingTo,
            ,
            ,
            ,
        ) = groups.groups(id);
    }

    function _recipient(uint256 id, uint256 cycle) internal view returns (address) {
        return groups.recipientOf(id, cycle);
    }

}
