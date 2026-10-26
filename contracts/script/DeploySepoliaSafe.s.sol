// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console2} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ProtocolDeployer} from "../src/ProtocolDeployer.sol";
import {TokenAllowlist} from "../src/TokenAllowlist.sol";
import {FlowConduit} from "../src/FlowConduit.sol";
import {FlowVault} from "../src/FlowVault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {LockVault} from "../src/LockVault.sol";
import {GroupRotation} from "../src/GroupRotation.sol";
import {ITokenAllowlist} from "../src/interfaces/ITokenAllowlist.sol";
import {SuperfluidAddresses} from "../src/SuperfluidAddresses.sol";

/// @notice Base Sepolia deployment owned by a 2-of-3 Safe.
///         The signers are Jamie, Alex, and Taylor. Any two of them can act.
contract DeploySepoliaSafe is Script {
    address internal constant SAFE_FACTORY = 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67;
    address internal constant SAFE_SINGLETON = 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762;
    address internal constant SAFE_FALLBACK = 0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99;
    address internal constant EXPECTED_SAFE = 0xA9741381a7bd12Ed9c6354D685438ecD66d8eD56;

    function run() external {
        require(block.chainid == 84532, "unexpected chain");
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address payer = vm.addr(pk);
        uint256 nonce = vm.getNonce(payer);
        address bootstrapAddr = vm.computeCreateAddress(payer, nonce);

        address[] memory owners = new address[](3);
        owners[0] = 0x7190De5bf1dEDEad830ba81F64e70801Dc575797;
        owners[1] = 0x8351f673C77CB49Fe25d4bB6F2198c01167C9b51;
        owners[2] = 0xfccEAFCe6A372ed3181E041f07A33fe1503c7176;
        bytes memory initializer = abi.encodeCall(
            ISafeSetup.setup,
            (owners, 2, address(0), "", SAFE_FALLBACK, address(0), 0, payable(address(0)))
        );

        uint256 child = 1;
        address allowImpl = vm.computeCreateAddress(bootstrapAddr, child++);
        address allowlist = vm.computeCreateAddress(bootstrapAddr, child++);
        address conduit = vm.computeCreateAddress(bootstrapAddr, child++);
        address vaultImpl = vm.computeCreateAddress(bootstrapAddr, child++);
        address factoryImpl = vm.computeCreateAddress(bootstrapAddr, child++);
        address factoryAddr = vm.computeCreateAddress(bootstrapAddr, child++);
        address lockImpl = vm.computeCreateAddress(bootstrapAddr, child++);
        address locksAddr = vm.computeCreateAddress(bootstrapAddr, child++);
        address groupImpl = vm.computeCreateAddress(bootstrapAddr, child++);
        address groupsAddr = vm.computeCreateAddress(bootstrapAddr, child++);

        bytes[] memory codes = new bytes[](10);
        codes[0] = abi.encodePacked(type(TokenAllowlist).creationCode, abi.encode(EXPECTED_SAFE));
        codes[1] = abi.encodePacked(
            type(ERC1967Proxy).creationCode,
            abi.encode(
                allowImpl,
                abi.encodeWithSignature(
                    "initialize(address,address,uint8,address,uint8)",
                    EXPECTED_SAFE,
                    SuperfluidAddresses.BASE_SEPOLIA_FUSDCX,
                    ITokenAllowlist.TokenKind.Wrapper,
                    SuperfluidAddresses.BASE_SEPOLIA_ETHX,
                    ITokenAllowlist.TokenKind.Native
                )
            )
        );
        codes[2] = abi.encodePacked(type(FlowConduit).creationCode, abi.encode(SuperfluidAddresses.CFA_V1_FORWARDER));
        codes[3] = abi.encodePacked(
            type(FlowVault).creationCode,
            abi.encode(SuperfluidAddresses.BASE_SEPOLIA_HOST, SuperfluidAddresses.CFA_V1_FORWARDER, conduit)
        );
        codes[4] = abi.encodePacked(
            type(VaultFactory).creationCode, abi.encode(EXPECTED_SAFE, allowlist, vaultImpl)
        );
        codes[5] = abi.encodePacked(
            type(ERC1967Proxy).creationCode,
            abi.encode(
                factoryImpl,
                abi.encodeWithSignature(
                    "initialize(address,address,address)", EXPECTED_SAFE, allowlist, vaultImpl
                )
            )
        );
        codes[6] = abi.encodePacked(
            type(LockVault).creationCode,
            abi.encode(
                EXPECTED_SAFE, allowlist, SuperfluidAddresses.BASE_SEPOLIA_HOST, SuperfluidAddresses.CFA_V1_FORWARDER
            )
        );
        codes[7] = abi.encodePacked(
            type(ERC1967Proxy).creationCode,
            abi.encode(lockImpl, abi.encodeWithSignature("initialize(address)", EXPECTED_SAFE))
        );
        codes[8] = abi.encodePacked(
            type(GroupRotation).creationCode,
            abi.encode(allowlist, SuperfluidAddresses.BASE_SEPOLIA_HOST, SuperfluidAddresses.GDA_V1_FORWARDER)
        );
        codes[9] = abi.encodePacked(
            type(ERC1967Proxy).creationCode,
            abi.encode(groupImpl, abi.encodeWithSignature("initialize(address)", EXPECTED_SAFE))
        );

        vm.startBroadcast(pk);
        ProtocolDeployer bootstrap = new ProtocolDeployer();
        require(address(bootstrap) == bootstrapAddr, "bootstrap address");
        for (uint256 i; i < codes.length; ++i) {
            bytes[] memory one = new bytes[](1);
            one[0] = codes[i];
            bootstrap.deploy(SAFE_FACTORY, SAFE_SINGLETON, initializer, 0, EXPECTED_SAFE, one);
        }
        vm.stopBroadcast();

        console2.log("Payer", payer);
        console2.log("Safe", EXPECTED_SAFE);
        console2.log("Jamie", owners[0]);
        console2.log("Alex", owners[1]);
        console2.log("Taylor", owners[2]);
        console2.log("TokenAllowlist", allowlist);
        console2.log("TokenAllowlistImplementation", allowImpl);
        console2.log("FlowConduitImplementation", conduit);
        console2.log("FlowVaultImplementation", vaultImpl);
        console2.log("VaultFactory", factoryAddr);
        console2.log("VaultFactoryImplementation", factoryImpl);
        console2.log("LockVault", locksAddr);
        console2.log("LockVaultImplementation", lockImpl);
        console2.log("GroupRotation", groupsAddr);
        console2.log("GroupRotationImplementation", groupImpl);
    }
}

interface ISafeSetup {
    function setup(
        address[] calldata _owners,
        uint256 _threshold,
        address to,
        bytes calldata data,
        address fallbackHandler,
        address paymentToken,
        uint256 payment,
        address payable paymentReceiver
    ) external;
}
