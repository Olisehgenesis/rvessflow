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
import {FlowVaultStore} from "../src/FlowVaultStore.sol";
import {FlowConduit} from "../src/FlowConduit.sol";
import {LockVault} from "../src/LockVault.sol";
import {GroupRotation} from "../src/GroupRotation.sol";
import {ITokenAllowlist} from "../src/interfaces/ITokenAllowlist.sol";
import {ISuperTokenMini, ICFAv1Forwarder, IGDAv1Forwarder} from "../src/interfaces/ISuperfluidMini.sol";
import {SuperTokenReceiver} from "../src/SuperTokenReceiver.sol";

/// @notice Local Superfluid fixture. Warp with an absolute timestamp captured via
///         `vm.getBlockTimestamp()`. `via_ir` can reuse a `block.timestamp` read
///         across `vm.warp` inside one function.
abstract contract SfBase is Test, SuperTokenReceiver {
    uint256 internal constant USDC_FUND = 2_000_000e6;

    SuperfluidFrameworkDeployer internal sfDeployer;
    SuperfluidFrameworkDeployer.Framework internal sf;
    TestToken internal usdc;
    TestToken internal dai;
    ISuperToken internal usdcx;
    ISuperToken internal daix;
    ISuperToken internal ethx;
    ISuperToken internal purex;

    TokenAllowlist internal allow;
    VaultFactory internal factory;
    FlowVault internal flowImpl;
    FlowConduit internal conduitImpl;
    LockVault internal locks;
    GroupRotation internal groups;
    ICFAv1Forwarder internal cfaFwd;
    IGDAv1Forwarder internal gdaFwd;

    address internal admin = makeAddr("admin");
    address internal keeper = makeAddr("keeper");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    function setUp() public virtual {
        vm.etch(ERC1820RegistryCompiled.ADDRESS, ERC1820RegistryCompiled.BYTECODE);
        vm.warp(1_700_000_000);
        _registerSuperTokenReceiver();

        sfDeployer = new SuperfluidFrameworkDeployer();
        sfDeployer.deployTestFramework();
        sf = sfDeployer.getFramework();
        cfaFwd = ICFAv1Forwarder(address(sf.cfaV1Forwarder));
        gdaFwd = IGDAv1Forwarder(address(sf.gdaV1Forwarder));

        (usdc, usdcx) = sfDeployer.deployWrapperSuperToken("USD Coin", "USDC", 6, type(uint256).max, address(0));
        (dai, daix) = sfDeployer.deployWrapperSuperToken("Dai Stablecoin", "DAI", 18, type(uint256).max, address(0));
        ethx = sfDeployer.deployNativeAssetSuperToken("Super ETH", "ETHx");
        purex = sfDeployer.deployPureSuperToken("Rvess Pure", "PURE", 1_000_000 ether);

        allow = new TokenAllowlist(admin);
        vm.startPrank(admin);
        allow.setSuperToken(address(usdcx), true, ITokenAllowlist.TokenKind.Wrapper);
        allow.setSuperToken(address(daix), true, ITokenAllowlist.TokenKind.Wrapper);
        allow.setSuperToken(address(ethx), true, ITokenAllowlist.TokenKind.Native);
        allow.setSuperToken(address(purex), true, ITokenAllowlist.TokenKind.Pure);
        vm.stopPrank();

        conduitImpl = new FlowConduit(address(cfaFwd));
        flowImpl = new FlowVault(address(sf.host), address(cfaFwd), address(conduitImpl));
        factory = new VaultFactory(admin, address(allow), address(flowImpl));
        vm.prank(admin);
        factory.setKeeper(keeper);
        locks = new LockVault(admin, address(allow), address(sf.host), address(cfaFwd));
        groups = new GroupRotation(address(allow), address(sf.host), address(gdaFwd));
    }

    function _open(address user) internal returns (FlowVault vault) {
        if (factory.vaultOf(user) == address(0)) {
            vm.prank(user);
            factory.createVault();
        }
        vault = FlowVault(payable(factory.vaultOf(user)));
    }

    function _depositUnderlying(FlowVault vault, address user, TestToken underlying, ISuperToken superToken, uint256 amount)
        internal
    {
        underlying.mint(user, amount);
        vm.startPrank(user);
        underlying.approve(address(vault), type(uint256).max);
        vault.depositUnderlying(address(superToken), amount);
        vm.stopPrank();
    }

    function _giveUsdcx(address user, uint256 underlyingAmount) internal {
        usdc.mint(user, underlyingAmount);
        vm.startPrank(user);
        usdc.approve(address(usdcx), type(uint256).max);
        usdcx.upgrade(underlyingAmount * 1e12);
        vm.stopPrank();
    }

    function _approveToken(address user, address token, address spender) internal {
        vm.prank(user);
        ISuperTokenMini(token).approve(spender, type(uint256).max);
    }

    function _bal(address token, address who) internal view returns (uint256) {
        return ISuperTokenMini(token).balanceOf(who);
    }

    function _assertSolvent(address token, address account) internal view {
        uint256 nowT = vm.getBlockTimestamp();
        assertFalse(ISuperTokenMini(token).isAccountCritical(account, nowT));
        assertFalse(ISuperTokenMini(token).isAccountCritical(account, nowT + 1 hours));
    }

    function _params(
        address token,
        address to,
        FlowVaultStore.FlowKind kind,
        uint256 amount,
        uint64 startAt,
        uint64 duration,
        uint256 goal,
        bool subs,
        uint256 pred,
        FlowVaultStore.ChainMode mode,
        bool gated
    ) internal pure returns (FlowVaultStore.CreateFlowParams memory) {
        return FlowVaultStore.CreateFlowParams({
            token: token,
            recipient: to,
            kind: kind,
            amount: amount,
            earliestStart: startAt,
            duration: duration,
            goalAmount: goal,
            allowSubflows: subs,
            predecessorId: pred,
            chainMode: mode,
            keeperGated: gated,
            name: bytes32("flow")
        });
    }

    function _create(FlowVault vault, address user, FlowVaultStore.CreateFlowParams memory p) internal returns (uint256 id) {
        vm.prank(user);
        id = vault.createFlow(p);
    }

    function _sub(
        FlowVault vault,
        address user,
        uint256 parentId,
        address to,
        FlowVaultStore.FlowKind kind,
        FlowVaultStore.RateMode mode,
        uint256 amount,
        uint16 share,
        uint256 goal,
        bool subs
    ) internal returns (uint256 id) {
        vm.prank(user);
        id = vault.createSubflow(
            FlowVaultStore.CreateSubflowParams({
                parentId: parentId,
                recipient: to,
                kind: kind,
                rateMode: mode,
                amount: amount,
                shareBps: share,
                goalAmount: goal,
                allowSubflows: subs,
                name: bytes32("sub")
            })
        );
    }

    function _members(uint256 n, string memory salt) internal returns (address[] memory accounts) {
        accounts = new address[](n);
        for (uint256 i; i < n; ++i) {
            accounts[i] = makeAddr(string.concat(salt, vm.toString(i)));
        }
    }

    function _zeroOffsets(uint256 n) internal pure returns (uint64[] memory offsets) {
        offsets = new uint64[](n);
    }

    receive() external payable {}
}
