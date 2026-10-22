// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";
import {SuperfluidFrameworkDeployer} from
    "@superfluid-finance/ethereum-contracts/contracts/utils/SuperfluidFrameworkDeployer.t.sol";
import {ERC1820RegistryCompiled} from
    "@superfluid-finance/ethereum-contracts/contracts/libs/ERC1820RegistryCompiled.sol";
import {ISuperToken} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperToken.sol";
import {TestToken} from "@superfluid-finance/ethereum-contracts/contracts/utils/TestToken.sol";

import {TokenAllowlist} from "../src/TokenAllowlist.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {FlowVault} from "../src/FlowVault.sol";
import {FlowConduit} from "../src/FlowConduit.sol";
import {ITokenAllowlist} from "../src/interfaces/ITokenAllowlist.sol";

contract SmokeTest is Test {
    SuperfluidFrameworkDeployer.Framework internal sf;
    TestToken internal usdc;
    ISuperToken internal usdcx;
    TokenAllowlist internal allow;
    VaultFactory internal factory;
    FlowVault internal vault;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        vm.etch(ERC1820RegistryCompiled.ADDRESS, ERC1820RegistryCompiled.BYTECODE);
        vm.warp(1_700_000_000);
        SuperfluidFrameworkDeployer deployer = new SuperfluidFrameworkDeployer();
        deployer.deployTestFramework();
        sf = deployer.getFramework();
        (usdc, usdcx) = deployer.deployWrapperSuperToken("USD Coin", "USDC", 6, type(uint256).max, address(0));

        allow = new TokenAllowlist(alice);
        vm.prank(alice);
        allow.setSuperToken(address(usdcx), true, ITokenAllowlist.TokenKind.Wrapper);
        FlowConduit conduit = new FlowConduit(address(sf.cfaV1Forwarder));
        FlowVault impl = new FlowVault(address(sf.host), address(sf.cfaV1Forwarder), address(conduit));
        factory = new VaultFactory(alice, address(allow), address(impl));
        vm.prank(alice);
        vault = FlowVault(payable(factory.createVault()));
    }

    function test_streamPaysBob() public {
        uint256 underlying = 10_000_000; // 10 USDC
        usdc.mint(alice, underlying);
        vm.startPrank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vault.depositUnderlying(address(usdcx), underlying);
        uint256 id = vault.createFlow(
            FlowVault.CreateFlowParams({
                token: address(usdcx),
                recipient: bob,
                kind: FlowVault.FlowKind.Expense,
                amount: 1e18,
                earliestStart: 0,
                duration: 1 days,
                goalAmount: 0,
                allowSubflows: false,
                predecessorId: 0,
                chainMode: FlowVault.ChainMode.None,
                keeperGated: false,
                name: "rent"
            })
        );
        vault.activate(id);
        vm.stopPrank();

        assertFalse(usdcx.isAccountCritical(address(vault), vm.getBlockTimestamp() + vault.PROTECT_WINDOW()));
        int96 rate = sf.cfaV1Forwarder.getAccountFlowrate(usdcx, bob);
        assertGt(rate, 0);

        FlowVault.Flow memory f = vault.getFlow(id);
        vm.warp(f.start + 12 hours);
        assertGt(usdcx.balanceOf(bob), 0);

        vm.warp(f.end);
        vault.settle(id);
        assertApproxEqAbs(usdcx.balanceOf(bob), 1e18, 1e12);
        assertEq(usdcx.balanceOf(address(vault)), vault.unallocated(address(usdcx)));
        assertFalse(usdcx.isAccountCritical(address(vault), vm.getBlockTimestamp() + 1));

        uint256 idle = vault.unallocated(address(usdcx));
        vm.prank(alice);
        vault.withdraw(address(usdcx), idle);
        assertEq(usdcx.balanceOf(address(vault)), 0);
    }
}
