// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console2} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {TokenAllowlist} from "../src/TokenAllowlist.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {FlowVault} from "../src/FlowVault.sol";
import {FlowConduit} from "../src/FlowConduit.sol";
import {LockVault} from "../src/LockVault.sol";
import {GroupRotation} from "../src/GroupRotation.sol";
import {ITokenAllowlist} from "../src/interfaces/ITokenAllowlist.sol";
import {SuperfluidAddresses} from "../src/SuperfluidAddresses.sol";

/// @notice Deploy RvessFlow against the canonical Superfluid deployment.
///         Reads PRIVATE_KEY from the environment. Never commit a key.
///         The intended Base Sepolia deployer is 0xB1819b7287B8e709A526D942f5c3e1ae7389054D.
abstract contract DeployRvess is Script {
    address internal constant BASE_SEPOLIA_DEPLOYER = 0xB1819b7287B8e709A526D942f5c3e1ae7389054D;

    function _deploy(uint256 expectedChainId) internal {
        require(block.chainid == expectedChainId, "unexpected chain");
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address keeper = vm.envOr("KEEPER", address(0));

        vm.startBroadcast(pk);
        address host;
        address cfa = SuperfluidAddresses.CFA_V1_FORWARDER;
        address gda = SuperfluidAddresses.GDA_V1_FORWARDER;
        if (expectedChainId == 8453) {
            host = SuperfluidAddresses.BASE_HOST;
        } else if (expectedChainId == 42220) {
            host = SuperfluidAddresses.CELO_HOST;
        } else {
            host = SuperfluidAddresses.BASE_SEPOLIA_HOST;
        }
        TokenAllowlist allow = TokenAllowlist(
            _proxy(address(new TokenAllowlist(deployer)), abi.encodeWithSignature("initialize(address)", deployer))
        );
        FlowConduit conduit = new FlowConduit(cfa);
        FlowVault implementation = new FlowVault(host, cfa, address(conduit));
        VaultFactory factory = VaultFactory(
            _proxy(
                address(new VaultFactory(deployer, address(allow), address(implementation))),
                abi.encodeWithSignature(
                    "initialize(address,address,address)", deployer, address(allow), address(implementation)
                )
            )
        );
        LockVault locks = LockVault(
            _proxy(
                address(new LockVault(deployer, address(allow), host, cfa)),
                abi.encodeCall(LockVault.initialize, (deployer))
            )
        );
        GroupRotation groups = GroupRotation(
            _proxy(
                address(new GroupRotation(address(allow), host, gda)),
                abi.encodeCall(GroupRotation.initialize, (deployer))
            )
        );

        if (expectedChainId == 8453) {
            allow.setSuperToken(SuperfluidAddresses.BASE_USDCX, true, ITokenAllowlist.TokenKind.Wrapper);
            allow.setSuperToken(SuperfluidAddresses.BASE_ETHX, true, ITokenAllowlist.TokenKind.Native);
        } else if (expectedChainId == 42220) {
            allow.setSuperToken(SuperfluidAddresses.CELO_CUSDX, true, ITokenAllowlist.TokenKind.Wrapper);
            allow.setSuperToken(SuperfluidAddresses.CELO_CELOX, true, ITokenAllowlist.TokenKind.Native);
            allow.setSuperToken(SuperfluidAddresses.CELO_G, true, ITokenAllowlist.TokenKind.Pure);
        } else {
            allow.setSuperToken(SuperfluidAddresses.BASE_SEPOLIA_FUSDCX, true, ITokenAllowlist.TokenKind.Wrapper);
            allow.setSuperToken(SuperfluidAddresses.BASE_SEPOLIA_ETHX, true, ITokenAllowlist.TokenKind.Native);
        }
        if (keeper != address(0)) factory.setKeeper(keeper);
        vm.stopBroadcast();

        console2.log("Deployer", deployer);
        if (expectedChainId == 84532 && deployer != BASE_SEPOLIA_DEPLOYER) {
            console2.log("Expected Base Sepolia deployer", BASE_SEPOLIA_DEPLOYER);
        }
        console2.log("TokenAllowlist", address(allow));
        console2.log("FlowConduitImplementation", address(conduit));
        console2.log("FlowVaultImplementation", address(implementation));
        console2.log("FlowVaultExtension", implementation.extension());
        console2.log("VaultFactory", address(factory));
        console2.log("LockVault", address(locks));
        console2.log("GroupRotation", address(groups));
        console2.log("GroupRotationExtension", groups.extension());
        console2.log("Host", host);
        console2.log("CFAv1Forwarder", cfa);
        console2.log("GDAv1Forwarder", gda);
        console2.log("Keeper", keeper);
    }

    function _proxy(address implementation, bytes memory initCall) internal returns (address) {
        return address(new ERC1967Proxy(implementation, initCall));
    }
}

contract DeployBaseSepolia is DeployRvess {
    function run() external {
        _deploy(84532);
    }
}

contract DeployBaseMainnet is DeployRvess {
    function run() external {
        _deploy(8453);
    }
}

contract DeployCelo is DeployRvess {
    function run() external {
        _deploy(42220);
    }
}
