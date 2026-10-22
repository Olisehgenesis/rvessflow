// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {SfBase} from "./SfBase.sol";
import {FlowVault} from "../src/FlowVault.sol";
import {GroupRotation} from "../src/GroupRotation.sol";

contract FlowVaultV2 is FlowVault {
    constructor(address host_, address cfa_, address conduit_) FlowVault(host_, cfa_, conduit_) {}

    function contractVersion() external pure returns (uint256) {
        return 2;
    }
}

contract GroupRotationV2 is GroupRotation {
    constructor(address allowlist_, address host_, address gda_) GroupRotation(allowlist_, host_, gda_) {}

    function contractVersion() public pure override returns (uint256) {
        return 2;
    }
}

contract UpgradeTest is SfBase {
    function test_adminUpgradesVaultsAndTheGroup() public {
        FlowVault vault = _open(alice);
        FlowVaultV2 nextVault = new FlowVaultV2(address(sf.host), address(cfaFwd), address(conduitImpl));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        factory.upgradeVaults(address(nextVault));
        vm.prank(admin);
        factory.upgradeVaults(address(nextVault));
        assertEq(FlowVaultV2(payable(address(vault))).contractVersion(), 2);

        GroupRotation impl = new GroupRotation(address(allow), address(sf.host), address(gdaFwd));
        GroupRotation proxied = GroupRotation(
            address(new ERC1967Proxy(address(impl), abi.encodeCall(GroupRotation.initialize, (admin))))
        );
        assertEq(proxied.contractVersion(), 1);
        assertEq(proxied.owner(), admin);
        GroupRotationV2 nextGroup = new GroupRotationV2(address(allow), address(sf.host), address(gdaFwd));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        proxied.upgradeToAndCall(address(nextGroup), "");
        vm.prank(admin);
        proxied.upgradeToAndCall(address(nextGroup), "");
        assertEq(GroupRotationV2(address(proxied)).contractVersion(), 2);
    }
}
