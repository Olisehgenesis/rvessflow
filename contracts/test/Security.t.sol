// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ISuperAgreement, ISuperfluid} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {ISuperToken} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperToken.sol";
import {IConstantFlowAgreementV1} from
    "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {SfBase} from "./SfBase.sol";
import {BalanceToken} from "./mocks/Mocks.sol";
import {FlowVault} from "../src/FlowVault.sol";
import {FlowVaultStore} from "../src/FlowVaultStore.sol";
import {LockVault} from "../src/LockVault.sol";
import {ITokenAllowlist} from "../src/interfaces/ITokenAllowlist.sol";
import {ISuperTokenMini, ISuperfluidHost} from "../src/interfaces/ISuperfluidMini.sol";

/// @notice Regression tests for the Superfluid integration risks in SECURITY.md.
contract SecurityTest is SfBase {
    address internal liquidator = makeAddr("liquidator");

    function test_solventVaultCannotBeLiquidated() public {
        (FlowVault vault, uint256 id) = _openExpense();
        address conduit = vault.getFlow(id).conduit;
        vm.prank(liquidator);
        vm.expectRevert(IConstantFlowAgreementV1.CFA_NON_CRITICAL_SENDER.selector);
        _liquidate(address(vault), conduit);
        assertGt(cfaFwd.getFlowrate(address(usdcx), address(vault), conduit), 0);
        _assertSolvent(address(usdcx), address(vault));
    }

    function test_unprotectedStreamBecomesCriticalAndLiquidatable() public {
        (FlowVault vault, uint256 id) = _openExpense();
        uint256 end = vault.getFlow(id).end;
        uint256 t = end + vault.PROTECT_WINDOW() + 1;
        vm.warp(t);
        while (!usdcx.isAccountCritical(address(vault), vm.getBlockTimestamp()) && t < end + 2 days) {
            t += 15 minutes;
            vm.warp(t);
        }
        // The first moments of a critical account are the patrician window: the
        // deposit reward goes to the protocol, not the caller. Step into the pleb
        // window, where the liquidator keeps the deposit.
        while (sf.cfa.isPatricianPeriod(usdcx, address(vault), vm.getBlockTimestamp()) && t < end + 2 days) {
            t += 15 minutes;
            vm.warp(t);
        }
        assertTrue(usdcx.isAccountCritical(address(vault), vm.getBlockTimestamp()));
        assertFalse(sf.cfa.isPatricianPeriod(usdcx, address(vault), vm.getBlockTimestamp()));
        address conduit = vault.getFlow(id).conduit;
        uint256 before = _bal(address(usdcx), liquidator);
        vm.prank(liquidator);
        _liquidate(address(vault), conduit);
        assertEq(cfaFwd.getFlowrate(address(usdcx), address(vault), conduit), 0);
        assertGt(_bal(address(usdcx), liquidator), before);
        vault.settle(id);
        _assertSolvent(address(usdcx), address(vault));
    }

    function test_protectClosesBeforeTheAccountIsCritical() public {
        (FlowVault vault, uint256 id) = _openExpense();
        uint256 end = vault.getFlow(id).end;
        vm.warp(end + 1);
        assertFalse(usdcx.isAccountCritical(address(vault), vm.getBlockTimestamp()));
        vault.protect(address(usdcx));
        assertTrue(vault.getFlow(id).settled);
        _assertSolvent(address(usdcx), address(vault));
        vm.warp(vm.getBlockTimestamp() + 1 days);
        _assertSolvent(address(usdcx), address(vault));
    }

    function test_recipientCanStopTheOutwardStream() public {
        (FlowVault vault, uint256 id) = _openExpense();
        address conduit = vault.getFlow(id).conduit;
        vm.prank(bob);
        cfaFwd.deleteFlow(address(usdcx), conduit, bob, "");
        assertEq(cfaFwd.getFlowrate(address(usdcx), conduit, bob), 0);
        vault.protect(address(usdcx));
        assertTrue(vault.getFlow(id).settled);
        _assertSolvent(address(usdcx), address(vault));
        assertEq(_bal(address(usdcx), address(vault)), vault.unallocated(address(usdcx)) + vault.protocolFees(address(usdcx)));
    }

    function test_reentrancyAndEmptyHookDoNotCreditTwice() public {
        FlowVault vault = _open(alice);
        BalanceToken token = new BalanceToken();
        vm.prank(admin);
        allow.setSuperToken(address(token), true, ITokenAllowlist.TokenKind.Pure);
        token.mint(alice, 100e18);
        token.configure(address(vault), true, 0);
        vm.prank(alice);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        vault.depositSuper(address(token), 10e18);
        assertEq(vault.unallocated(address(token)), 0);

        token.configure(address(vault), false, 0);
        vm.prank(alice);
        vault.depositSuper(address(token), 10e18);
        uint256 credited = vault.unallocated(address(token));
        vault.tokensReceived(alice, alice, address(vault), 10e18, "", "");
        assertEq(vault.unallocated(address(token)), credited);
    }

    function test_subflowCannotExceedParentAndKeeperCannotPull() public {
        FlowVault vault = _open(alice);
        _depositUnderlying(vault, alice, usdc, usdcx, USDC_FUND);
        uint256 id = _create(
            vault,
            alice,
            _params(address(usdcx), bob, FlowVaultStore.FlowKind.Expense, 1_000e18, 0, 1 days, 0, true, 0, FlowVaultStore.ChainMode.None, true)
        );
        _sub(vault, alice, id, carol, FlowVaultStore.FlowKind.Expense, FlowVaultStore.RateMode.Share, 0, 7_000, 0, false);
        vm.expectRevert(FlowVaultStore.RateExceeded.selector);
        _sub(vault, alice, id, makeAddr("erin"), FlowVaultStore.FlowKind.Expense, FlowVaultStore.RateMode.Share, 0, 4_000, 0, false);
        vm.expectRevert(FlowVaultStore.NotTriggered.selector);
        vault.activate(id);
        vm.prank(keeper);
        vault.trigger(id);
        assertEq(_bal(address(usdcx), keeper), 0);
        assertFalse(ISuperfluidHost(address(sf.host)).isApp(address(vault)));
        (uint8 permissions, int96 allowance) = cfaFwd.getFlowOperatorPermissions(address(usdcx), address(vault), keeper);
        assertEq(permissions, 0);
        assertEq(allowance, 0);
        _assertSolvent(address(usdcx), address(vault));
    }

    function test_adminCannotTakeLockPrincipal() public {
        _giveUsdcx(alice, 1_000e6);
        _approveToken(alice, address(usdcx), address(locks));
        vm.prank(alice);
        uint256 id = locks.lock(address(usdcx), 100e18, 1 hours, false);
        uint256 held = locks.principalHeld(address(usdcx));
        vm.prank(admin);
        locks.setPenaltyBps(1_000);
        vm.expectRevert(LockVault.NotLock.selector);
        vm.prank(admin);
        locks.breakEarly(id);
        assertEq(locks.principalHeld(address(usdcx)), held);
        assertEq(_bal(address(usdcx), admin), 0);
    }

    function test_pauseDoesNotBlockSettle() public {
        (FlowVault vault, uint256 id) = _openExpense();
        vm.prank(admin);
        allow.setPaused(true);
        vm.warp(vault.getFlow(id).end);
        vault.settle(id);
        uint256 idle = vault.unallocated(address(usdcx));
        vm.prank(alice);
        vault.withdraw(address(usdcx), idle);
        _assertSolvent(address(usdcx), address(vault));
    }

    function _openExpense() internal returns (FlowVault vault, uint256 id) {
        vault = _open(alice);
        _depositUnderlying(vault, alice, usdc, usdcx, 1_000e6);
        id = _create(
            vault,
            alice,
            _params(address(usdcx), bob, FlowVaultStore.FlowKind.Expense, 100e18, 0, 1 days, 0, false, 0, FlowVaultStore.ChainMode.None, false)
        );
        uint256 idle = vault.unallocated(address(usdcx));
        vm.prank(alice);
        vault.withdraw(address(usdcx), idle);
        vm.prank(alice);
        vault.activate(id);
        _assertSolvent(address(usdcx), address(vault));
    }

    function _liquidate(address sender, address receiver) internal {
        ISuperfluid(address(sf.host)).callAgreement(
            ISuperAgreement(address(sf.cfa)),
            abi.encodeCall(
                IConstantFlowAgreementV1.deleteFlow,
                (ISuperToken(address(usdcx)), sender, receiver, new bytes(0))
            ),
            ""
        );
    }
}
