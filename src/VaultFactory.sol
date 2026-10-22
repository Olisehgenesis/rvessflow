// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {BeaconProxy} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {FlowVault} from "./FlowVault.sol";

/// @title VaultFactory
/// @notice One upgradeable {FlowVault} per person. The keeper may only signal a
///         gated flow. It cannot move funds, and flows still run if no keeper is set.
/// @dev Vaults and conduits are beacon proxies. The owner upgrades every vault,
///      or every conduit, with one call. This factory itself is UUPS.
contract VaultFactory is Initializable, Ownable2Step, UUPSUpgradeable {
    UpgradeableBeacon public vaultBeacon;
    UpgradeableBeacon public conduitBeacon;
    address public allowlist;
    address public keeper;

    mapping(address user => address vault) public vaultOf;

    event VaultCreated(address indexed owner, address indexed vault);
    event KeeperSet(address indexed keeper);
    event AllowlistSet(address indexed allowlist);

    error ZeroAddress();
    error VaultExists();

    constructor(address initialOwner, address allowlist_, address implementation) Ownable(initialOwner) {
        if (allowlist_ == address(0) || implementation == address(0)) revert ZeroAddress();
        _init(allowlist_, implementation);
        _disableInitializers();
    }

    function initialize(address initialOwner, address allowlist_, address implementation) external initializer {
        if (initialOwner == address(0) || allowlist_ == address(0) || implementation == address(0)) {
            revert ZeroAddress();
        }
        _transferOwnership(initialOwner);
        _init(allowlist_, implementation);
    }

    function contractVersion() public pure virtual returns (uint256) {
        return 1;
    }

    function createVault() external returns (address vault) {
        if (vaultOf[msg.sender] != address(0)) revert VaultExists();
        vault = address(
            new BeaconProxy(address(vaultBeacon), abi.encodeCall(FlowVault.initialize, (msg.sender, address(this))))
        );
        vaultOf[msg.sender] = vault;
        emit VaultCreated(msg.sender, vault);
    }

    function upgradeVaults(address newImplementation) external onlyOwner {
        if (newImplementation == address(0)) revert ZeroAddress();
        vaultBeacon.upgradeTo(newImplementation);
    }

    function upgradeConduits(address newImplementation) external onlyOwner {
        if (newImplementation == address(0)) revert ZeroAddress();
        conduitBeacon.upgradeTo(newImplementation);
    }

    function _init(address allowlist_, address vaultImplementation) internal {
        allowlist = allowlist_;
        address conduitImpl = FlowVault(payable(vaultImplementation)).conduitImplementation();
        if (conduitImpl == address(0)) revert ZeroAddress();
        conduitBeacon = new UpgradeableBeacon(conduitImpl, address(this));
        vaultBeacon = new UpgradeableBeacon(vaultImplementation, address(this));
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        if (newImplementation == address(0)) revert ZeroAddress();
    }

    function setKeeper(address keeper_) external onlyOwner {
        keeper = keeper_;
        emit KeeperSet(keeper_);
    }

    function setAllowlist(address allowlist_) external onlyOwner {
        if (allowlist_ == address(0)) revert ZeroAddress();
        allowlist = allowlist_;
        emit AllowlistSet(allowlist_);
    }
}
