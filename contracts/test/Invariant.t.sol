// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";

import {SfBase} from "./SfBase.sol";
import {FlowVault} from "../src/FlowVault.sol";
import {FlowVaultStore} from "../src/FlowVaultStore.sol";
import {LockVault} from "../src/LockVault.sol";
import {GroupRotation} from "../src/GroupRotation.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {ISuperToken} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperToken.sol";
import {TestToken} from "@superfluid-finance/ethereum-contracts/contracts/utils/TestToken.sol";
import {ISuperTokenMini} from "../src/interfaces/ISuperfluidMini.sol";

contract RvessHandler is Test {
    VaultFactory public factory;
    LockVault public locks;
    GroupRotation public groups;
    ISuperToken public token;
    TestToken public underlying;
    address[3] public users;
    FlowVault[3] public vaults;
    uint256 public groupId;

    constructor(
        VaultFactory factory_,
        LockVault locks_,
        GroupRotation groups_,
        ISuperToken token_,
        TestToken underlying_
    ) {
        factory = factory_;
        locks = locks_;
        groups = groups_;
        token = token_;
        underlying = underlying_;
        for (uint256 i; i < 3; ++i) {
            users[i] = makeAddr(string.concat("inv", vm.toString(i)));
            vm.prank(users[i]);
            vaults[i] = FlowVault(payable(factory.createVault()));
            underlying.mint(users[i], 2_000_000e6);
            vm.startPrank(users[i]);
            underlying.approve(address(vaults[i]), type(uint256).max);
            vaults[i].depositUnderlying(address(token), 1_000_000e6);
            underlying.approve(address(token), type(uint256).max);
            token.upgrade(500_000e6 * 1e12);
            token.approve(address(locks), type(uint256).max);
            token.approve(address(groups), type(uint256).max);
            vm.stopPrank();
        }
    }

    function halfOpen(uint96 rawRate, uint32 rawDur, bool withSub) external {
        _closeFlows();
        uint256 perSecond = bound(rawRate, 1e9, 1e12);
        uint64 duration = uint64(bound(rawDur, 1 hours, 3 days));
        uint256 i = uint256(rawRate) % 3;
        FlowVault vault = vaults[i];
        vm.prank(users[i]);
        uint256 id = vault.createFlow(
            FlowVaultStore.CreateFlowParams({
                token: address(token),
                recipient: users[(i + 1) % 3],
                kind: FlowVaultStore.FlowKind.Expense,
                amount: perSecond * duration,
                earliestStart: 0,
                duration: duration,
                goalAmount: 0,
                allowSubflows: true,
                predecessorId: 0,
                chainMode: FlowVaultStore.ChainMode.None,
                keeperGated: false,
                name: bytes32("inv")
            })
        );
        if (withSub) {
            vm.prank(users[i]);
            vault.createSubflow(
                FlowVaultStore.CreateSubflowParams({
                    parentId: id,
                    recipient: users[(i + 2) % 3],
                    kind: FlowVaultStore.FlowKind.Expense,
                    rateMode: FlowVaultStore.RateMode.Share,
                    amount: 0,
                    shareBps: 2_500,
                    goalAmount: 0,
                    allowSubflows: false,
                    name: bytes32("sub")
                })
            );
        }
        vm.prank(users[i]);
        vault.activate(id);
        FlowVaultStore.Flow memory flow = vault.getFlow(id);
        vm.warp(flow.start + duration / 2);
        vault.protect(address(token));
    }

    function cycleLock(uint96 rawAmt, bool breakEarly) external {
        _closeFlows();
        uint128 amount = uint128(bound(rawAmt, 1e18, 100e18));
        uint256 i = uint256(rawAmt) % 3;
        if (token.balanceOf(users[i]) < amount) return;
        vm.prank(users[i]);
        uint256 id = locks.lock(address(token), amount, 2 hours, false);
        if (breakEarly) {
            vm.prank(users[i]);
            locks.breakEarly(id);
        } else {
            vm.warp(vm.getBlockTimestamp() + 2 hours);
            vm.prank(users[i]);
            locks.withdrawMature(id);
        }
        locks.protect(address(token));
    }

    function runGroup() external {
        if (groupId != 0) {
            groups.protect(groupId);
            return;
        }
        _closeFlows();
        address[] memory members = new address[](3);
        uint64[] memory offsets = new uint64[](3);
        for (uint256 i; i < 3; ++i) members[i] = users[i];
        vm.prank(users[0]);
        groupId = groups.createGroup(address(token), 1e18, 1 hours, 20 minutes, 5 minutes, 1, members, offsets);
        for (uint256 i; i < 3; ++i) {
            vm.prank(users[i]);
            groups.postCollateral(groupId);
        }
        vm.prank(users[0]);
        groups.start(groupId);
        for (uint256 i; i < 3; ++i) {
            vm.startPrank(users[i]);
            groups.connect(groupId);
            groups.contribute(groupId);
            vm.stopPrank();
        }
        uint256 t0 = vm.getBlockTimestamp();
        vm.warp(t0 + 10 minutes);
        groups.protect(groupId);
        vm.warp(t0 + 1 hours);
        groups.finalize(groupId);
    }

    function _closeFlows() internal {
        for (uint256 v; v < 3; ++v) {
            FlowVault vault = vaults[v];
            uint256 n = vault.flowCount();
            for (uint256 i; i < n; ++i) {
                uint256 id = vault.flowIdAt(i);
                FlowVaultStore.Flow memory flow = vault.getFlow(id);
                if (flow.parentId != 0 || !flow.active || flow.settled) continue;
                if (vm.getBlockTimestamp() < flow.end) vm.warp(flow.end);
                vault.settle(id);
            }
            vault.protect(address(token));
        }
    }
}

contract RvessInvariantTest is SfBase {
    RvessHandler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new RvessHandler(factory, locks, groups, usdcx, usdc);
        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](3);
        selectors[0] = RvessHandler.halfOpen.selector;
        selectors[1] = RvessHandler.cycleLock.selector;
        selectors[2] = RvessHandler.runGroup.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_vaultsStaySolvent() public view {
        uint256 nowT = vm.getBlockTimestamp();
        for (uint256 i; i < 3; ++i) {
            address vault = address(handler.vaults(i));
            assertFalse(usdcx.isAccountCritical(vault, nowT));
            assertFalse(usdcx.isAccountCritical(vault, nowT + 1 hours));
        }
        assertFalse(usdcx.isAccountCritical(address(locks), nowT));
        assertFalse(usdcx.isAccountCritical(address(groups), nowT));
    }

    function invariant_subflowRatesFit() public view {
        for (uint256 v; v < 3; ++v) {
            FlowVault vault = handler.vaults(v);
            uint256 n = vault.flowCount();
            for (uint256 i; i < n; ++i) {
                uint256 id = vault.flowIdAt(i);
                FlowVaultStore.Flow memory flow = vault.getFlow(id);
                uint256[] memory kids = vault.childrenOf(id);
                uint256 sum;
                for (uint256 k; k < kids.length; ++k) {
                    if (vault.getFlow(kids[k]).settled) continue;
                    sum += uint256(uint96(vault.getFlow(kids[k]).rate));
                }
                assertLe(sum, uint256(uint96(flow.rate)));
            }
        }
    }

    function invariant_principalStaysBacked() public view {
        (int256 available, uint256 deposit,,) = ISuperTokenMini(address(usdcx)).realtimeBalanceOfNow(address(locks));
        assertGe(available, 0);
        assertGe(uint256(available) + deposit, locks.principalHeld(address(usdcx)) + locks.bonusPool(address(usdcx)));
        assertLe(locks.penaltyBps(), locks.MAX_PENALTY_BPS());
    }

    function invariant_collateralStaysBacked() public view {
        uint256 id = handler.groupId();
        if (id == 0) return;
        (int256 available, uint256 deposit,,) = ISuperTokenMini(address(usdcx)).realtimeBalanceOfNow(address(groups));
        assertGe(available, 0);
        assertGe(groups.collateralHeld(address(usdcx)), groups.collateralOwed(id));
        assertGe(uint256(available) + deposit, groups.collateralHeld(address(usdcx)));
    }
}
