// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ProtocolDeployer} from "../src/ProtocolDeployer.sol";
import {TokenAllowlist} from "../src/TokenAllowlist.sol";
import {FlowConduit} from "../src/FlowConduit.sol";
import {FlowVault} from "../src/FlowVault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {LockVault} from "../src/LockVault.sol";
import {GroupRotation} from "../src/GroupRotation.sol";
import {ITokenAllowlist} from "../src/interfaces/ITokenAllowlist.sol";
import {SfBase} from "./SfBase.sol";

contract MockSafeFactory {
    address public immutable safe;

    constructor(address safe_) {
        safe = safe_;
    }

    function createProxyWithNonce(address, bytes calldata, uint256) external view returns (address) {
        return safe;
    }
}

contract ProtocolDeployerTest is SfBase {
    function test_oneCallLeavesTheTwoOfThreeAsOwner() public {
        address safe = makeAddr("two-of-three");
        ProtocolDeployer bootstrap = new ProtocolDeployer();
        uint256 nonce = 1;
        address allowImpl = vm.computeCreateAddress(address(bootstrap), nonce++);
        address allowlist = vm.computeCreateAddress(address(bootstrap), nonce++);
        address conduit = vm.computeCreateAddress(address(bootstrap), nonce++);
        address vaultImpl = vm.computeCreateAddress(address(bootstrap), nonce++);
        address factoryImpl = vm.computeCreateAddress(address(bootstrap), nonce++);
        address factoryAddr = vm.computeCreateAddress(address(bootstrap), nonce++);
        address lockImpl = vm.computeCreateAddress(address(bootstrap), nonce++);
        address locksAddr = vm.computeCreateAddress(address(bootstrap), nonce++);
        address groupImpl = vm.computeCreateAddress(address(bootstrap), nonce++);
        address groupsAddr = vm.computeCreateAddress(address(bootstrap), nonce++);

        bytes[] memory initCodes = new bytes[](10);
        initCodes[0] = abi.encodePacked(type(TokenAllowlist).creationCode, abi.encode(safe));
        initCodes[1] = _proxy(
            allowImpl,
            abi.encodeWithSignature(
                "initialize(address,address,uint8,address,uint8)",
                safe,
                address(usdcx),
                ITokenAllowlist.TokenKind.Wrapper,
                address(ethx),
                ITokenAllowlist.TokenKind.Native
            )
        );
        initCodes[2] = abi.encodePacked(type(FlowConduit).creationCode, abi.encode(address(cfaFwd)));
        initCodes[3] = abi.encodePacked(
            type(FlowVault).creationCode, abi.encode(address(sf.host), address(cfaFwd), conduit)
        );
        initCodes[4] = abi.encodePacked(
            type(VaultFactory).creationCode, abi.encode(safe, allowlist, vaultImpl)
        );
        initCodes[5] = _proxy(
            factoryImpl,
            abi.encodeWithSignature(
                "initialize(address,address,address,address)", safe, allowlist, vaultImpl, keeper
            )
        );
        initCodes[6] = abi.encodePacked(
            type(LockVault).creationCode, abi.encode(safe, allowlist, address(sf.host), address(cfaFwd))
        );
        initCodes[7] = _proxy(lockImpl, abi.encodeCall(LockVault.initialize, (safe)));
        initCodes[8] = abi.encodePacked(
            type(GroupRotation).creationCode, abi.encode(allowlist, address(sf.host), address(gdaFwd))
        );
        initCodes[9] = _proxy(groupImpl, abi.encodeCall(GroupRotation.initialize, (safe)));

        MockSafeFactory factory = new MockSafeFactory(safe);
        vm.prank(alice);
        address[] memory created = bootstrap.deploy(address(factory), address(0), "", 0, safe, initCodes);

        assertEq(created[0], allowImpl);
        assertEq(created[1], allowlist);
        assertEq(created[5], factoryAddr);
        assertEq(created[7], locksAddr);
        assertEq(created[9], groupsAddr);
        assertEq(TokenAllowlist(allowlist).owner(), safe);
        assertTrue(TokenAllowlist(allowlist).isAllowed(address(usdcx)));
        assertTrue(TokenAllowlist(allowlist).isAllowed(address(ethx)));
        assertEq(uint8(TokenAllowlist(allowlist).kindOf(address(usdcx))), uint8(ITokenAllowlist.TokenKind.Wrapper));
        assertEq(uint8(TokenAllowlist(allowlist).kindOf(address(ethx))), uint8(ITokenAllowlist.TokenKind.Native));
        assertEq(VaultFactory(factoryAddr).owner(), safe);
        assertEq(VaultFactory(factoryAddr).keeper(), keeper);
        assertEq(LockVault(locksAddr).owner(), safe);
        assertEq(GroupRotation(groupsAddr).owner(), safe);
    }

    function _proxy(address implementation, bytes memory init) private pure returns (bytes memory) {
        return abi.encodePacked(type(ERC1967Proxy).creationCode, abi.encode(implementation, init));
    }
}
