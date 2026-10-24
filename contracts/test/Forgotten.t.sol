// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {SavingsPool} from "../src/SavingsPool.sol";
import {GroupRotation, IGroupCalls} from "../src/GroupRotation.sol";
import {GroupRotationStore} from "../src/GroupRotationStore.sol";
import {FlowVault} from "../src/FlowVault.sol";
import {FlowVaultStore} from "../src/FlowVaultStore.sol";
import {ISuperfluidPool} from "../src/interfaces/ISuperfluidMini.sol";
import {SfBase} from "./SfBase.sol";

/// @notice The cases that used to stall, mis-count, or trap funds.
contract ForgottenTest is SfBase {
    SavingsPool internal pool;

    function setUp() public override {
        super.setUp();
        pool = new SavingsPool(address(allow), admin);
    }

    function test_sameRecipientStillGetsTheNextPot() public {
        address[] memory members = _members(3, "pot");
        uint64[] memory offsets = new uint64[](3);
        offsets[1] = 20 minutes;
        offsets[2] = 40 minutes;
        uint256 id = _start(members, 1e18, 1 hours, 10 minutes, 5 minutes, 2, offsets, true);
        uint256 t0 = vm.getBlockTimestamp();

        _pay(id, members[1], t0 + 20 minutes);
        _pay(id, members[2], t0 + 40 minutes);
        vm.warp(t0 + 1 hours);
        groups.sync(id);
        assertEq(_streamingTo(id), members[1]);

        uint256 before = _bal(address(usdcx), members[1]);
        _pay(id, members[0], t0 + 1 hours);
        _pay(id, members[1], t0 + 1 hours + 20 minutes);
        _pay(id, members[2], t0 + 1 hours + 40 minutes);
        vm.warp(t0 + 2 hours);
        groups.finalize(id);

        assertGt(_bal(address(usdcx), members[1]), before + 1e18);
        uint256 sitting = _bal(address(usdcx), address(groups));
        assertLt(sitting, groups.collateralOwed(id) + groups.protocolFees(address(usdcx)) + 0.1e18);
    }

    function test_quietGroupCatchesUpInBatches() public {
        address[] memory members = _members(3, "quiet");
        uint256 id = _start(members, 1e18, 1 hours, 20 minutes, 5 minutes, 40, _zeroOffsets(3), false);
        uint256 t0 = vm.getBlockTimestamp();
        vm.warp(t0 + 40 hours);
        groups.finalize(id);
        assertEq(groups.settledThrough(id), 16);
        assertFalse(_finalized(id));

        for (uint256 i; i < 5; ++i) {
            if (_finalized(id)) break;
            groups.finalize(id);
        }
        assertTrue(_finalized(id));
        vm.prank(members[0]);
        vm.expectRevert(GroupRotationStore.NothingToClaim.selector);
        groups.claimCollateral(id);
        _assertSolvent(address(usdcx), address(groups));
    }

    function test_exitKeepsThePayoutOrderAndAFlakeCanBeRemoved() public {
        address[] memory members = _members(4, "order");
        for (uint256 i; i < 4; ++i) {
            _giveUsdcx(members[i], 1_000e6);
            _approveToken(members[i], address(usdcx), address(groups));
        }
        vm.prank(members[0]);
        uint256 id = groups.createGroup(address(usdcx), 1e18, 1 hours, 10 minutes, 5 minutes, 1, members, _zeroOffsets(4));
        uint16[] memory order = new uint16[](4);
        order[0] = 3;
        order[1] = 2;
        order[2] = 1;
        order[3] = 0;
        vm.prank(members[0]);
        IGroupCalls(address(groups)).setPayoutOrder(id, order);
        vm.prank(members[0]);
        IGroupCalls(address(groups)).setMemberWindow(id, 3, 20 minutes);

        vm.prank(members[1]);
        IGroupCalls(address(groups)).exitBeforeStart(id);
        assertEq(IGroupCalls(address(groups)).payoutOrder(id).length, 3);
        assertEq(groups.recipientOf(id, 0), members[3]);
        assertEq(groups.memberWindow(id, 2), 20 minutes);

        address[] memory flake = _members(3, "flake");
        for (uint256 i; i < 3; ++i) {
            _giveUsdcx(flake[i], 500e6);
            _approveToken(flake[i], address(usdcx), address(groups));
        }
        vm.prank(flake[0]);
        uint256 stuck = groups.createGroup(address(usdcx), 1e18, 1 hours, 10 minutes, 5 minutes, 1, flake, _zeroOffsets(3));
        vm.prank(flake[0]);
        groups.postCollateral(stuck);
        vm.prank(flake[1]);
        groups.postCollateral(stuck);
        vm.prank(flake[0]);
        IGroupCalls(address(groups)).removeBeforeStart(stuck, flake[2]);
        vm.prank(flake[0]);
        vm.expectRevert(GroupRotationStore.BadParams.selector);
        groups.start(stuck);
    }

    function test_creatorWhoLeftCannotCancel() public {
        address[] memory members = _members(3, "left");
        for (uint256 i; i < 3; ++i) {
            _giveUsdcx(members[i], 500e6);
            _approveToken(members[i], address(usdcx), address(groups));
        }
        vm.prank(members[0]);
        uint256 id = groups.createGroup(address(usdcx), 1e18, 1 hours, 10 minutes, 5 minutes, 1, members, _zeroOffsets(3));
        vm.prank(members[0]);
        groups.postCollateral(id);
        vm.prank(members[0]);
        IGroupCalls(address(groups)).exitBeforeStart(id);
        vm.prank(members[0]);
        vm.expectRevert(GroupRotationStore.NotMember.selector);
        groups.cancelBeforeStart(id);
        vm.prank(members[1]);
        groups.cancelBeforeStart(id);
    }

    function test_tenGroupsAllStreamToOneMember() public {
        address pat = makeAddr("pat");
        uint256[10] memory ids;
        for (uint256 n; n < 10; ++n) {
            address[] memory members = new address[](3);
            members[0] = pat;
            members[1] = makeAddr(string.concat("b", vm.toString(n)));
            members[2] = makeAddr(string.concat("c", vm.toString(n)));
            ids[n] = _start(members, 1e18, 1 hours, 20 minutes, 5 minutes, 1, _zeroOffsets(3), false);
            address groupPool = groups.poolOf(ids[n]);
            if (n < 4) {
                vm.prank(pat);
                require(groups.connect(ids[n]), "autoconnect");
            } else {
                vm.expectRevert(abi.encodeWithSelector(GroupRotationStore.SelfConnectRequired.selector, groupPool));
                vm.prank(pat);
                groups.connect(ids[n]);
                vm.prank(pat);
                require(gdaFwd.connectPool(groupPool, ""), "self-connect");
            }
            require(_connected(groupPool, pat), "not linked");
            for (uint256 i; i < 3; ++i) {
                vm.prank(members[i]);
                groups.contribute(ids[n]);
            }
        }

        int96 sum;
        for (uint256 n; n < 10; ++n) {
            int96 rate = gdaFwd.getFlowDistributionFlowRate(address(usdcx), address(groups), groups.poolOf(ids[n]));
            assertGt(rate, 0, "each group is streaming");
            sum += rate;
        }
        int96 net = gdaFwd.getNetFlow(address(usdcx), pat);
        assertApproxEqRel(uint256(uint96(net)), uint256(uint96(sum)), 0.05e18, "ten streams add up");

        uint256 before = _bal(address(usdcx), pat);
        vm.warp(vm.getBlockTimestamp() + 20 minutes);
        for (uint256 n; n < 10; ++n) groups.sync(ids[n]);

        assertGt(_bal(address(usdcx), pat), before + uint256(uint96(sum)) * 20 minutes / 2, "wallet received the streams");
        for (uint256 n; n < 10; ++n) {
            assertGt(ISuperfluidPool(groups.poolOf(ids[n])).getTotalAmountReceivedByMember(pat), 0, "pool paid pat");
        }
        _assertSolvent(address(usdcx), address(groups));
    }

    function test_goalChainSurvivesSettlingTheSavingsGoal() public {
        FlowVault vault = _open(alice);
        _depositUnderlying(vault, alice, usdc, usdcx, 20_000e6);
        uint256 goal = _create(
            vault,
            alice,
            _params(address(usdcx), alice, FlowVaultStore.FlowKind.SavingGoal, 800e18, 0, 2 days, 100e18, false, 0, FlowVaultStore.ChainMode.None, false)
        );
        uint256 chained = _create(
            vault,
            alice,
            _params(address(usdcx), bob, FlowVaultStore.FlowKind.FlowGoal, 100e18, 0, 1 days, 10e18, false, goal, FlowVaultStore.ChainMode.OnGoal, false)
        );
        vm.prank(alice);
        vault.activate(goal);
        vm.warp(vault.getFlow(goal).end);
        vault.protect(address(usdcx));
        assertTrue(vault.getFlow(goal).settled);
        vault.activate(chained);
        assertTrue(vault.getFlow(chained).active);
        _assertSolvent(address(usdcx), address(vault));
    }

    function test_savingSubflowIsHeld() public {
        FlowVault vault = _open(alice);
        _depositUnderlying(vault, alice, usdc, usdcx, 20_000e6);
        uint256 parent = _create(
            vault,
            alice,
            _params(address(usdcx), bob, FlowVaultStore.FlowKind.Expense, 1_000e18, 0, 1 days, 0, true, 0, FlowVaultStore.ChainMode.None, false)
        );
        uint256 child = _sub(
            vault, alice, parent, alice, FlowVaultStore.FlowKind.SavingGoal, FlowVaultStore.RateMode.Fixed, 100e18, 0, 50e18, false
        );
        vm.prank(alice);
        vault.activate(parent);
        assertEq(vault.getFlow(child).conduit, address(0));
        assertEq(vault.getFlow(child).liveRate, 0);
        assertGt(vault.getFlow(parent).liveRate, 0);
        assertLt(uint256(uint96(vault.getFlow(parent).liveRate)), uint256(uint96(vault.getFlow(parent).rate)));
    }

    function test_manySettledFlowsStillDeposit() public {
        FlowVault vault = _open(alice);
        _depositUnderlying(vault, alice, usdc, usdcx, 50_000e6);
        for (uint256 i; i < 40; ++i) {
            uint256 id = _create(
                vault,
                alice,
                _params(address(usdcx), bob, FlowVaultStore.FlowKind.Expense, 1e18, 0, 1 days, 0, false, 0, FlowVaultStore.ChainMode.None, false)
            );
            vm.prank(alice);
            vault.cancel(id);
        }
        _depositUnderlying(vault, alice, usdc, usdcx, 1_000e6);
        assertEq(vault.unallocated(address(usdcx)) > 0, true);
    }

    function test_feeWithdrawalKeepsTheCushion() public {
        FlowVault probe = _open(alice);
        _depositUnderlying(probe, alice, usdc, usdcx, 20_000e6);
        FlowVaultStore.CreateFlowParams memory params = _params(
            address(usdcx), carol, FlowVaultStore.FlowKind.Expense, 100e18, 0, 1 hours, 0, false, 0, FlowVaultStore.ChainMode.None, false
        );
        FlowVaultStore.Flow memory sample = probe.getFlow(_create(probe, alice, params));
        uint256 need = sample.reserved + sample.buffers + sample.cushion;
        uint256 minted = (need * 10_000 + 9_969) / 9_970;
        uint256 underlying = minted / 1e12 + 1;

        FlowVault vault = _open(bob);
        _depositUnderlying(vault, bob, usdc, usdcx, underlying);
        uint256 id = _create(vault, bob, params);
        vm.prank(bob);
        vault.activate(id);
        assertGt(vault.protocolFees(address(usdcx)), 0);

        uint256 cursor = vault.getFlow(id).end;
        bool held;
        for (uint256 i; i < 40; ++i) {
            uint256 snap = vm.snapshotState();
            vm.warp(cursor);
            if (usdcx.isAccountCritical(address(vault), vm.getBlockTimestamp())) {
                vm.revertToState(snap);
                break;
            }
            vm.prank(admin);
            try IVaultFees(address(vault)).withdrawProtocolFees(address(usdcx), admin) {
                vm.revertToState(snap);
                cursor += 5 minutes;
            } catch (bytes memory reason) {
                assertEq(bytes4(reason), FlowVaultStore.Insufficient.selector);
                assertGt(vault.protocolFees(address(usdcx)), 0);
                assertFalse(usdcx.isAccountCritical(address(vault), vm.getBlockTimestamp()));
                held = true;
                break;
            }
        }
        assertTrue(held);
    }

    function test_yieldResumesAtTheOriginalRate() public {
        vm.prank(admin);
        locks.setYieldPerTokenPerSecond(address(usdcx), 1e12);
        _giveUsdcx(alice, 2_000e6);
        _approveToken(alice, address(usdcx), address(locks));
        vm.prank(alice);
        locks.fundYield(address(usdcx), 5e18);
        vm.prank(alice);
        uint256 id = locks.lock(address(usdcx), 10e18, 30 days, true);
        int96 opened = cfaFwd.getFlowrate(address(usdcx), address(locks.yieldPayer()), alice);
        assertGt(opened, 0);

        vm.prank(admin);
        locks.setYieldPerTokenPerSecond(address(usdcx), 1e15);
        vm.prank(alice);
        locks.topUp(id, 10e18);
        int96 topped = cfaFwd.getFlowrate(address(usdcx), address(locks.yieldPayer()), alice);
        assertApproxEqAbs(uint256(uint96(topped - opened)), uint256(uint96(opened)), uint256(uint96(opened)) / 5);

        vm.warp(vm.getBlockTimestamp() + 20 days);
        locks.protect(address(usdcx));
        assertEq(cfaFwd.getFlowrate(address(usdcx), address(locks.yieldPayer()), alice), 0);
        vm.prank(alice);
        locks.fundYield(address(usdcx), 30e18);
        assertGt(cfaFwd.getFlowrate(address(usdcx), address(locks.yieldPayer()), alice), 0);

        vm.prank(alice);
        locks.breakEarly(id);
        uint256 adminBefore = _bal(address(usdcx), admin);
        vm.prank(admin);
        locks.withdrawUnusedYield(address(usdcx), admin);
        assertGt(_bal(address(usdcx), admin), adminBefore);
        _assertSolvent(address(usdcx), address(locks));
    }

    function test_guarantorMustAgreeAndADefaultReleasesTheOthers() public {
        _fund(alice);
        _fund(bob);
        _fund(carol);
        vm.prank(alice);
        uint256 id = pool.createPool(_clubParams());
        vm.startPrank(alice);
        pool.addMember(id, bob);
        pool.addMember(id, carol);
        pool.addAdmin(id, carol);
        pool.deposit(id, 100e18);
        vm.stopPrank();
        vm.prank(bob);
        pool.deposit(id, 100e18);
        vm.prank(carol);
        pool.deposit(id, 100e18);

        vm.prank(alice);
        uint256 loanId = pool.proposeLoan(id, 150e18, bob);
        vm.prank(carol);
        pool.approveLoan(id, loanId);
        vm.prank(alice);
        vm.expectRevert(SavingsPool.BadState.selector);
        pool.drawLoan(id, loanId);
        vm.prank(bob);
        pool.consentGuarantee(id, loanId);
        vm.prank(alice);
        pool.drawLoan(id, loanId);
        assertEq(pool.getSeat(id, 1).locked, 50e18);

        vm.prank(carol);
        vm.expectRevert(SavingsPool.BadState.selector);
        pool.withdraw(id, 100e18);

        vm.warp(vm.getBlockTimestamp() + 8 days);
        pool.recognizeDefault(id, loanId);
        uint256 before = _bal(address(usdcx), carol);
        vm.prank(carol);
        pool.withdraw(id, 100e18);
        assertEq(_bal(address(usdcx), carol) - before, 100e18);
    }

    function test_jointIgnoresAnEmptySeat() public {
        _fund(alice);
        _fund(bob);
        vm.prank(alice);
        SavingsPool.CreateParams memory params = _clubParams();
        params.kind = SavingsPool.Kind.Joint;
        params.target = 100e18;
        params.beneficiary = carol;
        params.reserveBps = 0;
        params.loanMultipleBps = 0;
        params.loanTerm = 0;
        params.fixedPledge = 0;
        params.pledgeMode = SavingsPool.PledgeMode.Individual;
        uint256 id = pool.createPool(params);
        vm.prank(alice);
        pool.addMember(id, bob);
        vm.prank(alice);
        pool.addMember(id, makeAddr("empty"));
        vm.prank(alice);
        pool.deposit(id, 60e18);
        vm.prank(bob);
        pool.deposit(id, 40e18);
        vm.prank(alice);
        pool.consent(id, true);
        vm.prank(bob);
        pool.consent(id, true);
        pool.payBeneficiary(id);
        assertEq(_bal(address(usdcx), carol), 100e18);
    }

    function test_prepayCoversThePeriodsItPaysFor() public {
        _fund(alice);
        vm.prank(alice);
        SavingsPool.CreateParams memory params = _clubParams();
        params.pledgeMode = SavingsPool.PledgeMode.Individual;
        params.fixedPledge = 0;
        params.lateFine = 1e18;
        uint256 id = pool.createPool(params);
        vm.prank(alice);
        pool.setPledge(id, 10e18);
        vm.prank(alice);
        pool.deposit(id, 400e18);
        assertGt(pool.getSeat(id, 0).nextDue, vm.getBlockTimestamp() + 39 days);
        vm.prank(alice);
        vm.expectRevert(SavingsPool.BadParams.selector);
        pool.setPledge(id, 1);
    }

    function _start(
        address[] memory members,
        uint128 contribution,
        uint64 cycle,
        uint64 window,
        uint64 grace,
        uint16 cycles,
        uint64[] memory offsets,
        bool connectMembers
    ) internal returns (uint256 id) {
        for (uint256 i; i < members.length; ++i) {
            _giveUsdcx(members[i], 5_000e6);
            _approveToken(members[i], address(usdcx), address(groups));
        }
        vm.prank(members[0]);
        id = groups.createGroup(address(usdcx), contribution, cycle, window, grace, cycles, members, offsets);
        for (uint256 i; i < members.length; ++i) {
            vm.prank(members[i]);
            groups.postCollateral(id);
        }
        vm.prank(members[0]);
        groups.start(id);
        if (connectMembers) {
            for (uint256 i; i < members.length; ++i) {
                vm.prank(members[i]);
                groups.connect(id);
            }
        }
    }

    function _pay(uint256 id, address member, uint256 moment) internal {
        vm.warp(moment);
        vm.prank(member);
        groups.contribute(id);
    }

    function _streamingTo(uint256 id) internal view returns (address) {
        return _group(id).streamingTo;
    }

    function _finalized(uint256 id) internal view returns (bool) {
        return _group(id).finalized;
    }

    function _group(uint256 id) internal view returns (GroupRotationStore.Group memory g) {
        (bool ok, bytes memory data) = address(groups).staticcall(abi.encodeWithSignature("groups(uint256)", id));
        require(ok, "group");
        g = abi.decode(data, (GroupRotationStore.Group));
    }

    function _connected(address poolAddr, address member) internal view returns (bool connected) {
        (bool success, bytes memory data) =
            address(gdaFwd).staticcall(abi.encodeWithSignature("isMemberConnected(address,address)", poolAddr, member));
        return success && data.length >= 32 && abi.decode(data, (bool));
    }

    function _fund(address user) internal {
        _giveUsdcx(user, 5_000e6);
        _approveToken(user, address(usdcx), address(pool));
    }

    function _clubParams() internal view returns (SavingsPool.CreateParams memory params) {
        params.token = address(usdcx);
        params.kind = SavingsPool.Kind.Club;
        params.pledgeMode = SavingsPool.PledgeMode.Fixed;
        params.fixedPledge = 10e18;
        params.loanMultipleBps = 20_000;
        params.interestBps = 1_000;
        params.reserveBps = 5_000;
        params.period = 1 days;
        params.loanTerm = 7 days;
        params.twoAdminAt = type(uint128).max;
    }
}

interface IVaultFees {
    function withdrawProtocolFees(address token, address to) external;
}
