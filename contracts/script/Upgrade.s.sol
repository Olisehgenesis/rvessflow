// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console2} from "forge-std/Script.sol";
import {TokenAllowlist} from "../src/TokenAllowlist.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {FlowVault} from "../src/FlowVault.sol";
import {FlowConduit} from "../src/FlowConduit.sol";
import {LockVault} from "../src/LockVault.sol";
import {GroupRotation} from "../src/GroupRotation.sol";
import {SuperfluidAddresses} from "../src/SuperfluidAddresses.sol";

interface IUpgrade {
    function upgradeToAndCall(address newImplementation, bytes calldata data) external payable;
}

/// @notice Upgrade the Base Sepolia proxies in place. The live contracts still
///         have a zero upgrade delay, so this executes immediately. The new code
///         waits six hours before the next upgrade.
contract UpgradeBaseSepolia is Script {
    address internal constant ALLOW = 0xD1c99f91c3495735929F49D62E430B9a1536D4EE;
    address internal constant FACTORY = 0xf60322153F176b98e552263465F05A9c260A0979;
    address internal constant LOCKS = 0xD28D065E0A9d1F12f14E3d51e245658A7aAAb410;
    address internal constant GROUPS = 0x37F0d018517Ce6F7E72476155b41251F0d6aA6F8;
    address internal constant DEPLOYER = 0xB1819b7287B8e709A526D942f5c3e1ae7389054D;

    function run() external {
        require(block.chainid == 84532, "unexpected chain");
        uint256 pk = vm.envUint("PRIVATE_KEY");
        require(vm.addr(pk) == DEPLOYER, "unexpected deployer");

        vm.startBroadcast(pk);

        FlowConduit conduit = new FlowConduit(SuperfluidAddresses.CFA_V1_FORWARDER);
        FlowVault vaultImpl = new FlowVault(
            SuperfluidAddresses.BASE_SEPOLIA_HOST, SuperfluidAddresses.CFA_V1_FORWARDER, address(conduit)
        );
        TokenAllowlist allowImpl = new TokenAllowlist(DEPLOYER);
        LockVault lockImpl = new LockVault(
            DEPLOYER, ALLOW, SuperfluidAddresses.BASE_SEPOLIA_HOST, SuperfluidAddresses.CFA_V1_FORWARDER
        );
        GroupRotation groupImpl = new GroupRotation(
            ALLOW, SuperfluidAddresses.BASE_SEPOLIA_HOST, SuperfluidAddresses.GDA_V1_FORWARDER
        );
        VaultFactory factoryImpl = new VaultFactory(DEPLOYER, ALLOW, address(vaultImpl));

        // Beacon upgrades have to run on the old factory, while its delay is still zero.
        VaultFactory factory = VaultFactory(FACTORY);
        factory.scheduleConduitUpgrade(address(conduit));
        factory.upgradeConduits(address(conduit));
        factory.scheduleVaultUpgrade(address(vaultImpl));
        factory.upgradeVaults(address(vaultImpl));

        _swap(ALLOW, address(allowImpl));
        _swap(LOCKS, address(lockImpl));
        _swap(GROUPS, address(groupImpl));
        _swap(FACTORY, address(factoryImpl));

        vm.stopBroadcast();

        console2.log("TokenAllowlist", address(allowImpl));
        console2.log("VaultFactory", address(factoryImpl));
        console2.log("LockVault", address(lockImpl));
        console2.log("GroupRotation", address(groupImpl));
        console2.log("FlowVault", address(vaultImpl));
        console2.log("FlowConduit", address(conduit));
        console2.log("FlowVaultExtension", vaultImpl.extension());
        console2.log("GroupRotationExtension", groupImpl.extension());
    }

    function _swap(address proxy, address next) internal {
        TokenAllowlist(proxy).scheduleUpgrade(next);
        IUpgrade(proxy).upgradeToAndCall(next, "");
    }
}
