// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {SfBase} from "./SfBase.sol";
import {LockVault} from "../src/LockVault.sol";
import {ISuperTokenMini} from "../src/interfaces/ISuperfluidMini.sol";

contract LockVaultTest is SfBase {
    function test_penaltyBonusAndMature() public {
        _giveUsdcx(alice, 10_000e6);
        _giveUsdcx(bob, 10_000e6);
        _giveUsdcx(carol, 10_000e6);
        _approveToken(alice, address(usdcx), address(locks));
        _approveToken(bob, address(usdcx), address(locks));
        _approveToken(carol, address(usdcx), address(locks));

        vm.prank(alice);
        uint256 a = locks.lock(address(usdcx), 10_000e18, 2 hours, false);
        vm.prank(bob);
        uint256 b = locks.lock(address(usdcx), 10_000e18, 1 hours, false);
        vm.prank(carol);
        uint256 c = locks.lock(address(usdcx), 10_000e18, 3 hours, false);

        (uint256 previewPay, uint256 previewPen) = locks.previewBreak(c);
        assertEq(previewPen, Math.mulDiv(10_000e18, 300, 10_000));
        assertEq(previewPay, 10_000e18 - previewPen);
        vm.prank(carol);
        (uint256 payout, uint256 penalty) = locks.breakEarly(c);
        assertEq(penalty, previewPen);
        assertEq(payout, previewPay);
        assertEq(locks.bonusPool(address(usdcx)), penalty);
        assertEq(_bal(address(usdcx), carol), 10_000e18 - 10_000e18 + payout);
        (uint256 settledPay, uint256 settledPen) = locks.previewBreak(c);
        assertEq(settledPay, 0);
        assertEq(settledPen, 0);

        uint256 t0 = vm.getBlockTimestamp();
        vm.warp(t0 + 1 hours);
        vm.expectRevert(LockVault.StillLocked.selector);
        vm.prank(alice);
        locks.withdrawMature(a);
        vm.prank(bob);
        (uint256 bobPay, uint256 bobBonus) = locks.withdrawMature(b);
        assertEq(bobBonus, Math.mulDiv(penalty, 10_000e18 * 1 hours, 10_000e18 * 2 hours + 10_000e18 * 1 hours));
        assertEq(bobPay, 10_000e18 + bobBonus);

        vm.warp(t0 + 2 hours);
        vm.prank(alice);
        (uint256 alicePay, uint256 aliceBonus) = locks.withdrawMature(a);
        assertEq(aliceBonus, locks.bonusPool(address(usdcx)) + aliceBonus);
        assertEq(alicePay, 10_000e18 + aliceBonus);
        assertEq(locks.bonusPool(address(usdcx)), 0);
        assertEq(locks.principalHeld(address(usdcx)), 0);
        _assertSolvent(address(usdcx), address(locks));
        assertEq(bobBonus + aliceBonus, penalty);
    }

    function test_yieldIsNotClawedBack() public {
        _giveUsdcx(alice, 100_000e6);
        _giveUsdcx(bob, 100_000e6);
        _approveToken(alice, address(usdcx), address(locks));
        _approveToken(bob, address(usdcx), address(locks));
        vm.startPrank(admin);
        locks.setYieldPerTokenPerSecond(address(usdcx), 1e12);
        vm.stopPrank();
        _giveUsdcx(admin, 100_000e6);
        _approveToken(admin, address(usdcx), address(locks));
        vm.prank(admin);
        locks.fundYield(address(usdcx), 50e18);

        vm.prank(alice);
        uint256 id = locks.lock(address(usdcx), 1_000e18, 7 days, true);
        vm.prank(bob);
        uint256 other = locks.lock(address(usdcx), 1_000e18, 7 days, true);
        uint256 t0 = vm.getBlockTimestamp();
        uint256 aliceAfterLock = _bal(address(usdcx), alice);
        vm.warp(t0 + 1 hours);
        assertGt(_bal(address(usdcx), alice), aliceAfterLock);
        uint256 streamed = _bal(address(usdcx), alice);
        vm.prank(alice);
        locks.breakEarly(id);
        assertGe(_bal(address(usdcx), alice), streamed);
        assertEq(cfaFwd.getFlowrate(address(usdcx), address(locks), alice), 0);
        assertGt(cfaFwd.getFlowrate(address(usdcx), address(locks), bob), 0);

        vm.warp(t0 + 11 hours);
        locks.protect(address(usdcx));
        locks.protectUser(address(usdcx), bob);
        assertEq(cfaFwd.getFlowrate(address(usdcx), address(locks), bob), 0);
        _assertSolvent(address(usdcx), address(locks));
        vm.warp(t0 + 7 days);
        vm.prank(bob);
        locks.withdrawMature(other);
        _assertSolvent(address(usdcx), address(locks));
        assertEq(locks.principalHeld(address(usdcx)), 0);
    }

    function test_underlyingPauseAndAdmin() public {
        _giveUsdcx(admin, 50_000e6);
        _approveToken(admin, address(usdcx), address(locks));
        usdc.mint(alice, 5_000e6);
        vm.startPrank(alice);
        usdc.approve(address(locks), type(uint256).max);
        uint256 id = locks.lockUnderlying(address(usdcx), 1_000e6, 2 hours, false);
        vm.stopPrank();
        usdc.mint(admin, 1_000e6);
        vm.startPrank(admin);
        usdc.approve(address(locks), type(uint256).max);
        locks.fundYieldUnderlying(address(usdcx), 100e6);
        vm.stopPrank();
        assertGt(locks.yieldBudget(address(usdcx)), 0);

        vm.prank(admin);
        locks.setPenaltyBps(0);
        vm.prank(admin);
        locks.setPenaltyBps(1_000);
        vm.expectRevert(LockVault.PenaltyTooHigh.selector);
        vm.prank(admin);
        locks.setPenaltyBps(1_001);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        locks.setPenaltyBps(1);

        vm.prank(admin);
        allow.setPaused(true);
        vm.expectRevert(LockVault.Paused.selector);
        vm.prank(alice);
        locks.lockUnderlying(address(usdcx), 1e6, 2 hours, false);
        vm.prank(alice);
        locks.breakEarly(id);
        vm.prank(admin);
        allow.setPaused(false);

        vm.prank(admin);
        locks.transferOwnership(alice);
        vm.prank(alice);
        locks.acceptOwnership();
        vm.prank(alice);
        locks.setYieldPerTokenPerSecond(address(usdcx), 1);
        assertEq(locks.owner(), alice);
    }

    function test_lockRejections() public {
        _giveUsdcx(alice, 10_000e6);
        _approveToken(alice, address(usdcx), address(locks));
        vm.startPrank(alice);
        vm.expectRevert(LockVault.ZeroAmount.selector);
        locks.lock(address(usdcx), 0, 1 hours, false);
        vm.expectRevert(LockVault.BadDuration.selector);
        locks.lock(address(usdcx), 1e18, 59 minutes, false);
        vm.expectRevert(LockVault.BadDuration.selector);
        locks.lock(address(usdcx), 1e18, uint64(30 * 365 days + 1), false);
        dai.mint(alice, 1e18);
        dai.approve(address(locks), type(uint256).max);
        vm.expectRevert(LockVault.TokenNotAllowed.selector);
        locks.lock(address(dai), 1e18, 1 hours, false);
        vm.expectRevert(LockVault.WrongTokenKind.selector);
        locks.lockUnderlying(address(ethx), 1 ether, 1 hours, false);
        vm.expectRevert(LockVault.InsufficientYield.selector);
        locks.lock(address(usdcx), 1e18, 1 hours, true);
        uint256 id = locks.lock(address(usdcx), 1e18, 2 hours, false);
        vm.stopPrank();
        vm.expectRevert(LockVault.NotLock.selector);
        vm.prank(bob);
        locks.breakEarly(id);
        vm.warp(vm.getBlockTimestamp() + 2 hours);
        vm.expectRevert(LockVault.Mature.selector);
        vm.prank(alice);
        locks.breakEarly(id);
        vm.prank(alice);
        locks.withdrawMature(id);
        vm.expectRevert(LockVault.NotLock.selector);
        vm.prank(alice);
        locks.withdrawMature(id);
        (uint256 principal, uint256 bonus) = locks.previewMature(id);
        assertEq(principal, 0);
        assertEq(bonus, 0);

        vm.expectRevert(LockVault.TokenNotAllowed.selector);
        vm.prank(admin);
        locks.setYieldPerTokenPerSecond(address(dai), 1);
        vm.expectRevert(LockVault.ZeroAmount.selector);
        locks.fundYield(address(usdcx), 0);
        vm.expectRevert(LockVault.TokenNotAllowed.selector);
        locks.fundYield(address(dai), 1);
        vm.expectRevert(LockVault.WrongTokenKind.selector);
        locks.fundYieldUnderlying(address(ethx), 1);
        assertEq(locks.locksOf(alice).length, 1);
        _assertSolvent(address(usdcx), address(locks));
    }

    function testFuzz_penaltyMatchesThreePercent(uint96 rawAmt, uint32 rawDur) public {
        uint128 amount = uint128(bound(rawAmt, 1e18, 1_000e18));
        uint64 duration = uint64(bound(rawDur, 1 hours, 365 days));
        _giveUsdcx(alice, 10_000e6);
        _approveToken(alice, address(usdcx), address(locks));
        vm.prank(alice);
        uint256 id = locks.lock(address(usdcx), amount, duration, false);
        vm.prank(alice);
        (uint256 payout, uint256 penalty) = locks.breakEarly(id);
        assertEq(penalty, Math.mulDiv(amount, locks.penaltyBps(), 10_000));
        assertEq(payout + penalty, amount);
        assertEq(locks.bonusPool(address(usdcx)), penalty);
        (int256 available, uint256 deposit,,) = ISuperTokenMini(address(usdcx)).realtimeBalanceOfNow(address(locks));
        assertGe(available, 0);
        assertGe(uint256(available) + deposit, locks.principalHeld(address(usdcx)) + locks.bonusPool(address(usdcx)));
        _assertSolvent(address(usdcx), address(locks));
    }
}
