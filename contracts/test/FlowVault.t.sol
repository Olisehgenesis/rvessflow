// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {SfBase} from "./SfBase.sol";
import {TokenProbe, MockAllowlist, EthRejector} from "./mocks/Mocks.sol";
import {FlowVault} from "../src/FlowVault.sol";
import {FlowVaultStore} from "../src/FlowVaultStore.sol";
import {FlowConduit} from "../src/FlowConduit.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {TokenAllowlist} from "../src/TokenAllowlist.sol";
import {ITokenAllowlist} from "../src/interfaces/ITokenAllowlist.sol";
import {ISuperTokenMini} from "../src/interfaces/ISuperfluidMini.sol";

contract FlowVaultTest is SfBase {
    function test_allowlistFactoryAndConduit() public {
        TokenProbe zeroDec = new TokenProbe(address(usdc), 0);
        TokenProbe highDec = new TokenProbe(address(usdc), 19);
        TokenProbe noUnderlying = new TokenProbe(address(0), 18);
        vm.startPrank(admin);
        vm.expectRevert(TokenAllowlist.ZeroAddress.selector);
        allow.setSuperToken(address(0), true, ITokenAllowlist.TokenKind.Wrapper);
        vm.expectRevert(TokenAllowlist.BadDecimals.selector);
        allow.setSuperToken(address(zeroDec), true, ITokenAllowlist.TokenKind.Wrapper);
        vm.expectRevert(TokenAllowlist.BadDecimals.selector);
        allow.setSuperToken(address(highDec), true, ITokenAllowlist.TokenKind.Wrapper);
        vm.expectRevert(TokenAllowlist.BadDecimals.selector);
        allow.setSuperToken(address(noUnderlying), true, ITokenAllowlist.TokenKind.Wrapper);
        vm.expectRevert(TokenAllowlist.TokenMismatch.selector);
        allow.setSuperToken(address(usdcx), true, ITokenAllowlist.TokenKind.Native);
        vm.expectRevert(TokenAllowlist.TokenMismatch.selector);
        allow.setSuperToken(address(usdcx), true, ITokenAllowlist.TokenKind.Pure);
        allow.setPaused(true);
        assertTrue(allow.paused());
        allow.setPaused(false);
        allow.setSuperToken(address(usdcx), false, ITokenAllowlist.TokenKind.Wrapper);
        assertFalse(allow.isAllowed(address(usdcx)));
        allow.setSuperToken(address(usdcx), true, ITokenAllowlist.TokenKind.Wrapper);
        assertEq(allow.underlyingOf(address(usdcx)), address(usdc));
        assertEq(allow.underlyingDecimalsOf(address(usdcx)), 6);
        assertEq(uint8(allow.kindOf(address(ethx))), uint8(ITokenAllowlist.TokenKind.Native));
        vm.stopPrank();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        allow.setPaused(true);

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new VaultFactory(address(0), address(allow), address(flowImpl));
        vm.expectRevert(VaultFactory.ZeroAddress.selector);
        new VaultFactory(admin, address(0), address(flowImpl));
        vm.expectRevert(FlowVaultStore.ZeroAddress.selector);
        new FlowVault(address(0), address(cfaFwd), address(conduitImpl));
        vm.expectRevert(FlowConduit.NotVault.selector);
        new FlowConduit(address(0));
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        flowImpl.initialize(admin, address(factory));
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        conduitImpl.initialize(address(this), address(usdcx));

        address clone = Clones.clone(address(flowImpl));
        vm.expectRevert(FlowVaultStore.NotFactory.selector);
        FlowVault(payable(clone)).initialize(alice, address(factory));
        address clone2 = Clones.clone(address(flowImpl));
        vm.prank(address(factory));
        vm.expectRevert(FlowVaultStore.ZeroAddress.selector);
        FlowVault(payable(clone2)).initialize(address(0), address(factory));

        FlowVault vault = _open(alice);
        vm.expectRevert(VaultFactory.VaultExists.selector);
        vm.prank(alice);
        factory.createVault();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        factory.setKeeper(bob);
        vm.expectRevert(VaultFactory.ZeroAddress.selector);
        vm.prank(admin);
        factory.setAllowlist(address(0));
        vm.prank(admin);
        factory.setKeeper(address(0));
        assertEq(factory.keeper(), address(0));
        vm.prank(admin);
        factory.setKeeper(keeper);

        vm.expectRevert(FlowConduit.NotVault.selector);
        conduitImpl.setStream(bob, 1);
        FlowConduit loose = FlowConduit(Clones.clone(address(conduitImpl)));
        loose.initialize(address(this), address(usdcx));
        assertEq(loose.close(), 0);
        vm.expectRevert(FlowConduit.NotVault.selector);
        vm.prank(alice);
        loose.close();

        assertEq(vault.owner(), alice);
        assertEq(vault.factory(), address(factory));
        (bool ok,) = address(vault).call{value: 1 ether}("");
        assertTrue(ok);
    }

    function test_flowRejections() public {
        FlowVault vault = _open(alice);
        _depositUnderlying(vault, alice, usdc, usdcx, USDC_FUND);
        _giveUsdcx(alice, 1_003e6);
        vm.startPrank(alice);
        usdcx.approve(address(vault), type(uint256).max);
        vault.depositSuper(address(usdcx), 1_000e18);
        vm.stopPrank();

        vm.expectRevert(FlowVaultStore.NotOwner.selector);
        vm.prank(bob);
        vault.withdraw(address(usdcx), 1);
        vm.expectRevert(FlowVaultStore.ZeroAmount.selector);
        vm.prank(alice);
        vault.depositSuper(address(usdcx), 0);
        vm.expectRevert(FlowVaultStore.TokenNotAllowed.selector);
        vm.prank(alice);
        vault.depositSuper(address(dai), 1);
        vm.expectRevert(FlowVaultStore.ZeroAmount.selector);
        vm.prank(alice);
        vault.withdraw(address(usdcx), 0);
        vm.expectRevert(FlowVaultStore.Insufficient.selector);
        vm.prank(alice);
        vault.withdraw(address(usdcx), type(uint128).max);
        vm.expectRevert(FlowVaultStore.WrongTokenKind.selector);
        vm.prank(alice);
        vault.depositUnderlying(address(ethx), 1);
        vm.deal(alice, 1 ether);
        vm.expectRevert(FlowVaultStore.WrongTokenKind.selector);
        vm.prank(alice);
        vault.depositNative{value: 1}(address(usdcx));
        vm.expectRevert(FlowVaultStore.ZeroAmount.selector);
        vm.prank(alice);
        vault.depositNative{value: 0}(address(ethx));
        vm.expectRevert(FlowVaultStore.BadAmount.selector);
        vm.prank(alice);
        vault.withdrawUnderlying(address(usdcx), 1);

        FlowVaultStore.CreateFlowParams memory bad = _params(
            address(usdcx), bob, FlowVaultStore.FlowKind.Expense, 1e18, 0, 1 days, 0, false, 0, FlowVaultStore.ChainMode.None, false
        );
        bad.recipient = address(0);
        vm.expectRevert(FlowVaultStore.ZeroAddress.selector);
        _create(vault, alice, bad);
        bad.recipient = bob;
        bad.duration = 59;
        vm.expectRevert(FlowVaultStore.BadDuration.selector);
        _create(vault, alice, bad);
        bad.duration = uint64(30 * 365 days + 1);
        vm.expectRevert(FlowVaultStore.BadDuration.selector);
        _create(vault, alice, bad);
        bad.duration = 1 days;
        bad.amount = 1;
        vm.expectRevert(FlowVaultStore.BadRate.selector);
        _create(vault, alice, bad);
        bad.amount = 1e18;
        bad.token = address(dai);
        vm.expectRevert(FlowVaultStore.TokenNotAllowed.selector);
        _create(vault, alice, bad);
        bad.token = address(usdcx);
        bad.goalAmount = 1;
        vm.expectRevert(FlowVaultStore.GoalNotAllowed.selector);
        _create(vault, alice, bad);
        bad.goalAmount = 0;
        bad.kind = FlowVaultStore.FlowKind.SavingGoal;
        bad.recipient = bob;
        bad.allowSubflows = false;
        vm.expectRevert(FlowVaultStore.RecipientMustBeOwner.selector);
        _create(vault, alice, bad);
        bad.recipient = alice;
        bad.allowSubflows = true;
        vm.expectRevert(FlowVaultStore.SubflowsNotAllowed.selector);
        _create(vault, alice, bad);
        bad.allowSubflows = false;
        bad.goalAmount = 0;
        vm.expectRevert(FlowVaultStore.GoalRequired.selector);
        _create(vault, alice, bad);
        bad.goalAmount = 1000e18;
        _create(vault, alice, bad);
        bad.kind = FlowVaultStore.FlowKind.FlowGoal;
        bad.recipient = bob;
        vm.expectRevert(FlowVaultStore.GoalTooLarge.selector);
        _create(vault, alice, bad);
        bad.kind = FlowVaultStore.FlowKind.FlowGoal;
        bad.recipient = bob;
        bad.goalAmount = 0;
        vm.expectRevert(FlowVaultStore.GoalRequired.selector);
        _create(vault, alice, bad);
        bad.predecessorId = 1;
        bad.goalAmount = 1e12;
        bad.chainMode = FlowVaultStore.ChainMode.None;
        vm.expectRevert(FlowVaultStore.BadChain.selector);
        _create(vault, alice, bad);
        bad.predecessorId = 0;
        bad.chainMode = FlowVaultStore.ChainMode.OnEnd;
        vm.expectRevert(FlowVaultStore.BadChain.selector);
        _create(vault, alice, bad);

        vm.prank(admin);
        allow.setPaused(true);
        bad.chainMode = FlowVaultStore.ChainMode.None;
        bad.kind = FlowVaultStore.FlowKind.Expense;
        bad.goalAmount = 0;
        vm.expectRevert(FlowVaultStore.Paused.selector);
        _create(vault, alice, bad);
        vm.prank(admin);
        allow.setPaused(false);

        uint256 blocked = _create(
            vault,
            alice,
            _params(address(usdcx), bob, FlowVaultStore.FlowKind.Expense, 100e18, 0, 1 days, 0, false, 0, FlowVaultStore.ChainMode.None, false)
        );
        vm.expectRevert(FlowVaultStore.SubflowsNotAllowed.selector);
        _sub(vault, alice, blocked, carol, FlowVaultStore.FlowKind.Expense, FlowVaultStore.RateMode.Fixed, 1e18, 0, 0, false);
        vm.prank(alice);
        vault.cancel(blocked);

        uint256 id = _create(
            vault,
            alice,
            _params(address(usdcx), bob, FlowVaultStore.FlowKind.Expense, 10_000e18, 0, 1 days, 0, true, 0, FlowVaultStore.ChainMode.None, false)
        );
        vm.expectRevert(FlowVaultStore.ZeroAddress.selector);
        _sub(vault, alice, id, address(0), FlowVaultStore.FlowKind.Expense, FlowVaultStore.RateMode.Fixed, 1e18, 0, 0, false);
        vm.expectRevert(FlowVaultStore.BadShare.selector);
        _sub(vault, alice, id, carol, FlowVaultStore.FlowKind.Expense, FlowVaultStore.RateMode.Share, 0, 0, 0, false);
        vm.expectRevert(FlowVaultStore.BadShare.selector);
        _sub(vault, alice, id, carol, FlowVaultStore.FlowKind.Expense, FlowVaultStore.RateMode.Share, 0, 10_001, 0, false);
        vm.expectRevert(FlowVaultStore.BadRate.selector);
        _sub(vault, alice, id, carol, FlowVaultStore.FlowKind.Expense, FlowVaultStore.RateMode.Fixed, 1, 0, 0, false);
        _sub(vault, alice, id, carol, FlowVaultStore.FlowKind.Expense, FlowVaultStore.RateMode.Share, 0, 6_000, 0, true);
        vm.expectRevert(FlowVaultStore.RateExceeded.selector);
        _sub(vault, alice, id, carol, FlowVaultStore.FlowKind.Expense, FlowVaultStore.RateMode.Share, 0, 5_000, 0, false);
        vm.expectRevert(FlowVaultStore.GoalNotAllowed.selector);
        _sub(vault, alice, id, carol, FlowVaultStore.FlowKind.Expense, FlowVaultStore.RateMode.Fixed, 10e18, 0, 1, false);
        vm.expectRevert(FlowVaultStore.RecipientMustBeOwner.selector);
        _sub(vault, alice, id, carol, FlowVaultStore.FlowKind.SavingGoal, FlowVaultStore.RateMode.Fixed, 10e18, 0, 1e12, false);
        vm.expectRevert(FlowVaultStore.GoalRequired.selector);
        _sub(vault, alice, id, alice, FlowVaultStore.FlowKind.SavingGoal, FlowVaultStore.RateMode.Fixed, 10e18, 0, 0, false);
        vm.expectRevert(FlowVaultStore.SubflowsNotAllowed.selector);
        _sub(vault, alice, id, alice, FlowVaultStore.FlowKind.SavingGoal, FlowVaultStore.RateMode.Fixed, 10e18, 0, 1e12, true);
        vm.prank(alice);
        vault.activate(id);
        vm.expectRevert(FlowVaultStore.ParentStarted.selector);
        _sub(vault, alice, id, carol, FlowVaultStore.FlowKind.Expense, FlowVaultStore.RateMode.Fixed, 10e18, 0, 0, false);
        vm.expectRevert(FlowVaultStore.NotGated.selector);
        vm.prank(alice);
        vault.trigger(id);
        vm.expectRevert(FlowVaultStore.NotFound.selector);
        vm.prank(alice);
        vault.trigger(99);
        vm.expectRevert(FlowVaultStore.StillActive.selector);
        vault.settle(id);
        vm.expectRevert(FlowVaultStore.NotFound.selector);
        vault.activate(99);
        vm.expectRevert(FlowVaultStore.NotFound.selector);
        vault.settle(99);
    }

    function test_streamsSubflowsAndSettle() public {
        FlowVault vault = _open(alice);
        _depositUnderlying(vault, alice, usdc, usdcx, USDC_FUND);
        uint256 t0 = vm.getBlockTimestamp();

        uint256 parent = _create(
            vault,
            alice,
            _params(
                address(usdcx), bob, FlowVaultStore.FlowKind.Expense, 10_000e18, 0, 1 days, 0, true, 0, FlowVaultStore.ChainMode.None, false
            )
        );
        uint256 child = _sub(vault, alice, parent, carol, FlowVaultStore.FlowKind.Expense, FlowVaultStore.RateMode.Share, 0, 2_500, 0, true);
        uint256 grand = _sub(
            vault, alice, child, makeAddr("dave"), FlowVaultStore.FlowKind.FlowGoal, FlowVaultStore.RateMode.Share, 0, 4_000, 1e15, true
        );
        uint256 deep = _sub(vault, alice, grand, alice, FlowVaultStore.FlowKind.Expense, FlowVaultStore.RateMode.Fixed, 100e18, 0, 0, true);
        assertEq(vault.getFlow(deep).depth, 3);
        vm.expectRevert(FlowVaultStore.TooDeep.selector);
        _sub(vault, alice, deep, bob, FlowVaultStore.FlowKind.Expense, FlowVaultStore.RateMode.Fixed, 1e18, 0, 0, false);

        uint256 fixedChild = _sub(vault, alice, parent, makeAddr("erin"), FlowVaultStore.FlowKind.Expense, FlowVaultStore.RateMode.Fixed, 100e18, 0, 0, false);
        FlowVaultStore.Flow memory before = vault.getFlow(parent);
        assertGt(before.buffers, 0);
        vm.prank(alice);
        vault.cancel(fixedChild);
        // The cancelled rate folds back into the parent residual, so the CFA deposit stays the same size.
        assertEq(vault.getFlow(parent).buffers, before.buffers);
        assertLt(vault.getFlow(parent).childRate, before.childRate);
        assertEq(vault.getFlow(fixedChild).settled, true);

        (uint256 balance, int96 net, uint256 ts) = vault.preview(address(usdcx), address(vault));
        assertGt(balance, 0);
        assertEq(net, 0);
        assertEq(ts, t0);
        assertGt(vault.flowCount(), 0);
        assertEq(vault.flowIdAt(0), parent);
        assertGt(vault.childrenOf(parent).length, 0);

        vm.prank(alice);
        vault.activate(parent);
        _assertSolvent(address(usdcx), address(vault));
        FlowVaultStore.Flow memory root = vault.getFlow(parent);
        FlowVaultStore.Flow memory sub = vault.getFlow(child);
        assertGt(root.liveRate, 0);
        assertEq(cfaFwd.getFlowrate(address(usdcx), address(vault), root.conduit), root.liveRate);
        assertEq(cfaFwd.getFlowrate(address(usdcx), sub.conduit, carol), sub.liveRate);
        uint256 liveSum = uint256(uint96(root.liveRate)) + uint256(uint96(sub.liveRate))
            + uint256(uint96(vault.getFlow(grand).liveRate)) + uint256(uint96(vault.getFlow(deep).liveRate));
        assertEq(liveSum, uint256(uint96(root.rate)));

        vm.warp(root.start + 12 hours);
        assertGt(_bal(address(usdcx), bob), 0);
        assertGt(_bal(address(usdcx), carol), 0);
        vault.protect(address(usdcx));
        _assertSolvent(address(usdcx), address(vault));

        vm.warp(root.end);
        vault.settle(parent);
        assertTrue(vault.getFlow(parent).settled);
        assertTrue(vault.getFlow(child).settled);
        assertApproxEqAbs(_bal(address(usdcx), bob) + _bal(address(usdcx), carol) + _bal(address(usdcx), makeAddr("dave")) + _bal(address(usdcx), alice), 10_000e18, 1e15);
        _assertSolvent(address(usdcx), address(vault));
        assertEq(_bal(address(usdcx), address(vault)), vault.unallocated(address(usdcx)) + vault.protocolFees(address(usdcx)));

        vm.prank(alice);
        vault.withdrawUnderlying(address(usdcx), 1e18);
        uint256 idle = vault.unallocated(address(usdcx));
        vm.prank(alice);
        vault.withdraw(address(usdcx), idle);
        assertEq(_bal(address(usdcx), address(vault)), vault.protocolFees(address(usdcx)));
        assertGt(_bal(address(usdcx), alice) + usdc.balanceOf(alice), 0);
        assertLt(vault.unallocated(address(usdcx)), idle);

        bytes32 magic = keccak256("ERC1820_ACCEPT_MAGIC");
        bytes32 recip = keccak256("ERC777TokensRecipient");
        assertEq(vault.canImplementInterfaceForAddress(recip, address(vault)), magic);
        assertEq(vault.canImplementInterfaceForAddress(recip, alice), bytes32(0));
        assertEq(vault.canImplementInterfaceForAddress(bytes32("nope"), address(vault)), bytes32(0));
        vault.tokensReceived(address(0), address(0), address(0), 1, "", "");
        assertEq(vault.unallocated(address(usdcx)), 0);
    }

    function test_twoRootsCancelAndProtect() public {
        FlowVault vault = _open(alice);
        _depositUnderlying(vault, alice, usdc, usdcx, USDC_FUND);
        uint256 a = _create(
            vault, alice, _params(address(usdcx), bob, FlowVaultStore.FlowKind.Expense, 1_000e18, 0, 2 days, 0, false, 0, FlowVaultStore.ChainMode.None, false)
        );
        uint256 b = _create(
            vault, alice, _params(address(usdcx), carol, FlowVaultStore.FlowKind.Expense, 1_000e18, 0, 4 days, 0, false, 0, FlowVaultStore.ChainMode.None, false)
        );
        vm.startPrank(alice);
        vault.activate(a);
        vault.activate(b);
        vm.stopPrank();
        FlowVaultStore.Flow memory fa = vault.getFlow(a);
        vm.warp(fa.end);
        vault.settle(a);
        assertTrue(vault.getFlow(b).active);
        assertGt(_bal(address(usdcx), address(vault)), vault.unallocated(address(usdcx)));

        uint256 drain = _bal(address(usdcx), address(vault));
        vm.prank(address(vault));
        usdcx.transfer(alice, drain);
        assertFalse(usdcx.isAccountCritical(address(vault), vm.getBlockTimestamp()));
        assertTrue(usdcx.isAccountCritical(address(vault), vm.getBlockTimestamp() + 1 hours));
        vault.protect(address(usdcx));
        assertTrue(vault.getFlow(b).settled);
        _assertSolvent(address(usdcx), address(vault));
    }

    function test_deferredKeeperAndChains() public {
        FlowVault vault = _open(alice);
        _depositUnderlying(vault, alice, usdc, usdcx, USDC_FUND);
        uint256 t0 = vm.getBlockTimestamp();

        uint256 expense = _create(
            vault,
            alice,
            _params(address(usdcx), bob, FlowVaultStore.FlowKind.Expense, 500e18, uint64(t0 + 1 days), 1 days, 0, false, 0, FlowVaultStore.ChainMode.None, true)
        );
        vm.expectRevert(FlowVaultStore.NotTriggered.selector);
        vault.activate(expense);
        vm.expectRevert(FlowVaultStore.NotOwner.selector);
        vm.prank(carol);
        vault.trigger(expense);
        vm.prank(keeper);
        vault.trigger(expense);
        vm.expectRevert(FlowVaultStore.AlreadyTriggered.selector);
        vm.prank(alice);
        vault.trigger(expense);
        vm.expectRevert(FlowVaultStore.TooEarly.selector);
        vault.activate(expense);
        vm.warp(t0 + 1 days);
        vault.activate(expense);
        _assertSolvent(address(usdcx), address(vault));
        vm.expectRevert(FlowVaultStore.GoalRequired.selector);
        _create(
            vault,
            alice,
            _params(address(usdcx), bob, FlowVaultStore.FlowKind.Expense, 100e18, 0, 1 days, 0, false, expense, FlowVaultStore.ChainMode.OnGoal, false)
        );

        uint256 goal = _create(
            vault,
            alice,
            _params(
                address(usdcx),
                alice,
                FlowVaultStore.FlowKind.SavingGoal,
                800e18,
                0,
                2 days,
                100e18,
                false,
                0,
                FlowVaultStore.ChainMode.None,
                false
            )
        );
        uint256 chained = _create(
            vault,
            alice,
            _params(
                address(usdcx), bob, FlowVaultStore.FlowKind.FlowGoal, 400e18, 0, 1 days, 10e18, false, goal, FlowVaultStore.ChainMode.OnGoal, false
            )
        );
        vm.expectRevert(FlowVaultStore.TooEarly.selector);
        vault.activate(chained);
        vm.prank(alice);
        vault.activate(goal);
        FlowVaultStore.Flow memory g = vault.getFlow(goal);
        vm.expectRevert(FlowVaultStore.TooEarly.selector);
        vault.activate(chained);
        vm.warp(g.start + 1 days);
        vault.activate(chained);
        _assertSolvent(address(usdcx), address(vault));

        uint256 first = _create(
            vault, alice, _params(address(usdcx), bob, FlowVaultStore.FlowKind.Expense, 200e18, 0, 1 days, 0, false, 0, FlowVaultStore.ChainMode.None, false)
        );
        uint256 pred = first;
        for (uint256 i = 1; i < 8; ++i) {
            pred = _create(
                vault,
                alice,
                _params(
                    address(usdcx), bob, FlowVaultStore.FlowKind.Expense, 200e18, 0, 1 days, 0, false, pred, FlowVaultStore.ChainMode.OnEnd, false
                )
            );
        }
        vm.expectRevert(FlowVaultStore.ChainTooLong.selector);
        _create(
            vault,
            alice,
            _params(address(usdcx), bob, FlowVaultStore.FlowKind.Expense, 200e18, 0, 1 days, 0, false, pred, FlowVaultStore.ChainMode.OnEnd, false)
        );
        uint256 branch = _create(
            vault,
            alice,
            _params(address(usdcx), bob, FlowVaultStore.FlowKind.Expense, 200e18, 0, 1 days, 0, true, 0, FlowVaultStore.ChainMode.None, false)
        );
        uint256 branchChild = _sub(vault, alice, branch, carol, FlowVaultStore.FlowKind.Expense, FlowVaultStore.RateMode.Fixed, 10e18, 0, 0, false);
        vm.expectRevert(FlowVaultStore.BadChain.selector);
        _create(
            vault,
            alice,
            _params(address(usdcx), bob, FlowVaultStore.FlowKind.Expense, 200e18, 0, 1 days, 0, false, branchChild, FlowVaultStore.ChainMode.OnEnd, false)
        );

        vm.prank(alice);
        vault.activate(first);
        FlowVaultStore.Flow memory started = vault.getFlow(first);
        vm.warp(started.end);
        uint256 nextId = vault.getFlow(first).predecessorId == 0 ? _successor(vault, first) : 0;
        nextId = _successor(vault, first);
        vault.activate(nextId);
        vault.settle(first);
        _assertSolvent(address(usdcx), address(vault));
        assertTrue(vault.getFlow(nextId).active);
    }

    function test_limitsChildrenAndManyFlows() public {
        FlowVault vault = _open(alice);
        _depositUnderlying(vault, alice, usdc, usdcx, USDC_FUND);
        uint256 parent = _create(
            vault,
            alice,
            _params(address(usdcx), bob, FlowVaultStore.FlowKind.Expense, 100_000e18, 0, 1 days, 0, true, 0, FlowVaultStore.ChainMode.None, false)
        );
        for (uint256 i; i < 16; ++i) {
            _sub(vault, alice, parent, makeAddr(string.concat("c", vm.toString(i))), FlowVaultStore.FlowKind.Expense, FlowVaultStore.RateMode.Fixed, 100e18, 0, 0, false);
        }
        vm.expectRevert(FlowVaultStore.TooManyChildren.selector);
        _sub(vault, alice, parent, carol, FlowVaultStore.FlowKind.Expense, FlowVaultStore.RateMode.Fixed, 100e18, 0, 0, false);
        vm.prank(alice);
        vault.cancel(parent);

        for (uint256 i; i < vault.MAX_FLOWS(); ++i) {
            _create(
                vault,
                alice,
                _params(address(usdcx), bob, FlowVaultStore.FlowKind.Expense, 1e18, 0, 1 days, 0, false, 0, FlowVaultStore.ChainMode.None, false)
            );
        }
        vm.expectRevert(FlowVaultStore.TooManyFlows.selector);
        _create(
            vault, alice, _params(address(usdcx), bob, FlowVaultStore.FlowKind.Expense, 1e18, 0, 1 days, 0, false, 0, FlowVaultStore.ChainMode.None, false)
        );
    }

    function test_manyAccountsDeferredAndYear() public {
        uint256 t0 = vm.getBlockTimestamp();
        address[10] memory users;
        FlowVault[10] memory vaults;
        uint256[10] memory immediate;
        uint256[10] memory deferred;
        for (uint256 i; i < 10; ++i) {
            users[i] = makeAddr(string.concat("saver", vm.toString(i)));
            address payee = makeAddr(string.concat("payee", vm.toString(i)));
            vaults[i] = _open(users[i]);
            _depositUnderlying(vaults[i], users[i], usdc, usdcx, 100_000e6);
            immediate[i] = _create(
                vaults[i],
                users[i],
                _params(address(usdcx), payee, FlowVaultStore.FlowKind.Expense, 1_000e18, 0, 30 days, 0, true, 0, FlowVaultStore.ChainMode.None, false)
            );
            _sub(vaults[i], users[i], immediate[i], users[i], FlowVaultStore.FlowKind.SavingGoal, FlowVaultStore.RateMode.Share, 0, 2_000, 10e18, false);
            uint256 saving = _create(
                vaults[i],
                users[i],
                _params(address(usdcx), users[i], FlowVaultStore.FlowKind.SavingGoal, 2_000e18, 0, 90 days, 100e18, false, 0, FlowVaultStore.ChainMode.None, false)
            );
            deferred[i] = _create(
                vaults[i],
                users[i],
                _params(
                    address(usdcx),
                    payee,
                    FlowVaultStore.FlowKind.Expense,
                    500e18,
                    uint64(t0 + 7 days),
                    14 days,
                    0,
                    false,
                    0,
                    FlowVaultStore.ChainMode.None,
                    false
                )
            );
            vm.startPrank(users[i]);
            vaults[i].activate(immediate[i]);
            vaults[i].activate(saving);
            vm.stopPrank();
            _assertSolvent(address(usdcx), address(vaults[i]));
        }
        vm.warp(t0 + 1 days);
        for (uint256 i; i < 10; ++i) {
            _assertSolvent(address(usdcx), address(vaults[i]));
            assertGt(_bal(address(usdcx), makeAddr(string.concat("payee", vm.toString(i)))), 0);
        }
        vm.warp(t0 + 7 days);
        for (uint256 i; i < 10; ++i) {
            vaults[i].activate(deferred[i]);
            _assertSolvent(address(usdcx), address(vaults[i]));
        }
        vm.warp(t0 + 30 days);
        for (uint256 i; i < 10; ++i) {
            if (vaults[i].getFlow(immediate[i]).active) vaults[i].settle(immediate[i]);
            _assertSolvent(address(usdcx), address(vaults[i]));
        }

        FlowVault year = _open(makeAddr("year"));
        _depositUnderlying(year, makeAddr("year"), usdc, usdcx, USDC_FUND);
        uint256 yid = _create(
            year,
            makeAddr("year"),
            _params(address(usdcx), bob, FlowVaultStore.FlowKind.Expense, 365 days * 1e12, 0, 365 days, 0, false, 0, FlowVaultStore.ChainMode.None, false)
        );
        vm.prank(makeAddr("year"));
        year.activate(yid);
        vm.warp(year.getFlow(yid).end);
        year.settle(yid);
        assertApproxEqAbs(_bal(address(usdcx), bob), 365 days * 1e12, 1e6);
        _assertSolvent(address(usdcx), address(year));

        uint64 maxDur = uint64(30 * 365 days);
        uint256 maxId = _create(
            year,
            makeAddr("year"),
            _params(address(usdcx), carol, FlowVaultStore.FlowKind.Expense, uint256(maxDur) * 1e9, 0, maxDur, 0, false, 0, FlowVaultStore.ChainMode.None, false)
        );
        vm.prank(makeAddr("year"));
        year.activate(maxId);
        vm.warp(year.getFlow(maxId).end);
        year.settle(maxId);
        _assertSolvent(address(usdcx), address(year));
    }

    function test_daiEthAndPure() public {
        FlowVault vault = _open(alice);
        _depositUnderlying(vault, alice, dai, daix, 1_000_000 ether);
        uint256 id = _create(
            vault, alice, _params(address(daix), bob, FlowVaultStore.FlowKind.Expense, 100 ether, 0, 1 days, 0, false, 0, FlowVaultStore.ChainMode.None, false)
        );
        vm.prank(alice);
        vault.activate(id);
        vm.warp(vault.getFlow(id).end);
        vault.settle(id);
        _assertSolvent(address(daix), address(vault));
        uint256 daiIdle = vault.unallocated(address(daix));
        vm.prank(alice);
        vault.withdraw(address(daix), daiIdle);

        vm.deal(alice, 20 ether);
        vm.prank(alice);
        vault.depositNative{value: 10 ether}(address(ethx));
        uint256 eid = _create(
            vault, alice, _params(address(ethx), bob, FlowVaultStore.FlowKind.Expense, 1 ether, 0, 1 days, 0, false, 0, FlowVaultStore.ChainMode.None, false)
        );
        vm.prank(alice);
        vault.activate(eid);
        _assertSolvent(address(ethx), address(vault));
        vm.warp(vault.getFlow(eid).end);
        vault.settle(eid);
        uint256 ethIdle = vault.unallocated(address(ethx));
        uint256 aliceEth = alice.balance;
        vm.prank(alice);
        vault.withdrawNative(address(ethx), ethIdle);
        assertEq(alice.balance, aliceEth + ethIdle);
        _assertSolvent(address(ethx), address(vault));

        purex.transfer(alice, 10_000 ether);
        vm.startPrank(alice);
        purex.approve(address(vault), type(uint256).max);
        vault.depositSuper(address(purex), 1_000 ether);
        vm.stopPrank();
        uint256 pid = _create(
            vault, alice, _params(address(purex), bob, FlowVaultStore.FlowKind.Expense, 10 ether, 0, 1 days, 0, false, 0, FlowVaultStore.ChainMode.None, false)
        );
        vm.prank(alice);
        vault.activate(pid);
        vm.warp(vault.getFlow(pid).start + 1 hours);
        vault.protect(address(purex));
        _assertSolvent(address(purex), address(vault));

        EthRejector rejector = new EthRejector();
        FlowVault rv = rejector.create(factory);
        vm.deal(address(this), 2 ether);
        rejector.deposit{value: 1 ether}(rv, address(ethx));
        vm.expectRevert(FlowVaultStore.Insufficient.selector);
        rejector.withdraw(rv, address(ethx), 1 ether);

        MockAllowlist mock = new MockAllowlist();
        mock.set(0, address(usdc), ITokenAllowlist.TokenKind.Wrapper);
        vm.prank(admin);
        factory.setAllowlist(address(mock));
        vm.expectRevert(FlowVaultStore.BadAmount.selector);
        vm.prank(alice);
        vault.depositUnderlying(address(usdcx), 1e6);
        mock.set(19, address(usdc), ITokenAllowlist.TokenKind.Wrapper);
        vm.expectRevert(FlowVaultStore.BadAmount.selector);
        vm.prank(alice);
        vault.depositUnderlying(address(usdcx), 1e6);
    }

    function test_brokenStreamSettlesEarly() public {
        FlowVault vault = _open(alice);
        _depositUnderlying(vault, alice, usdc, usdcx, USDC_FUND);
        uint256 id = _create(
            vault, alice, _params(address(usdcx), bob, FlowVaultStore.FlowKind.Expense, 1_000e18, 0, 7 days, 0, false, 0, FlowVaultStore.ChainMode.None, false)
        );
        vm.prank(alice);
        vault.activate(id);
        address conduit = vault.getFlow(id).conduit;
        vm.prank(bob);
        cfaFwd.deleteFlow(address(usdcx), conduit, bob, "");
        vault.settle(id);
        assertTrue(vault.getFlow(id).settled);
        _assertSolvent(address(usdcx), address(vault));
    }

    function testFuzz_flowSolvent(uint96 rawRate, uint32 rawDur) public {
        uint256 perSecond = bound(rawRate, 1e6, 1e15);
        uint64 duration = uint64(bound(rawDur, 60, 365 days));
        FlowVault vault = _open(alice);
        _depositUnderlying(vault, alice, usdc, usdcx, USDC_FUND);
        uint256 id = _create(
            vault,
            alice,
            _params(
                address(usdcx), bob, FlowVaultStore.FlowKind.Expense, perSecond * duration, 0, duration, 0, false, 0, FlowVaultStore.ChainMode.None, false
            )
        );
        vm.prank(alice);
        vault.activate(id);
        _assertSolvent(address(usdcx), address(vault));
        FlowVaultStore.Flow memory f = vault.getFlow(id);
        vm.warp(f.start + duration / 2);
        vault.protect(address(usdcx));
        _assertSolvent(address(usdcx), address(vault));
        assertGt(_bal(address(usdcx), bob), 0);
        vm.warp(f.end);
        vault.settle(id);
        _assertSolvent(address(usdcx), address(vault));
        assertEq(_bal(address(usdcx), address(vault)), vault.unallocated(address(usdcx)) + vault.protocolFees(address(usdcx)));
    }

    function testFuzz_subflowShare(uint16 rawA, uint16 rawB) public {
        uint16 shareA = uint16(bound(rawA, 1, 4_000));
        uint16 shareB = uint16(bound(rawB, 1, 4_000));
        FlowVault vault = _open(alice);
        _depositUnderlying(vault, alice, usdc, usdcx, USDC_FUND);
        uint256 parent = _create(
            vault,
            alice,
            _params(address(usdcx), bob, FlowVaultStore.FlowKind.Expense, 1e15 * 1 days, 0, 1 days, 0, true, 0, FlowVaultStore.ChainMode.None, false)
        );
        uint256 a = _sub(vault, alice, parent, carol, FlowVaultStore.FlowKind.Expense, FlowVaultStore.RateMode.Share, 0, shareA, 0, false);
        uint256 b = _sub(vault, alice, parent, makeAddr("erin"), FlowVaultStore.FlowKind.Expense, FlowVaultStore.RateMode.Share, 0, shareB, 0, false);
        FlowVaultStore.Flow memory root = vault.getFlow(parent);
        uint256 sum = uint256(uint96(vault.getFlow(a).rate)) + uint256(uint96(vault.getFlow(b).rate));
        assertLe(sum, uint256(uint96(root.rate)));
        vm.prank(alice);
        vault.activate(parent);
        _assertSolvent(address(usdcx), address(vault));
        vm.warp(vault.getFlow(parent).end);
        vault.settle(parent);
        _assertSolvent(address(usdcx), address(vault));
    }

    function _successor(FlowVault vault, uint256 pred) internal view returns (uint256) {
        uint256 n = vault.flowCount();
        for (uint256 i; i < n; ++i) {
            uint256 id = vault.flowIdAt(i);
            if (vault.getFlow(id).predecessorId == pred) return id;
        }
        return 0;
    }

}
