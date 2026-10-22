// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {FlowVault} from "./FlowVault.sol";

/// @title VaultFactory
/// @notice One {FlowVault} clone per person. The keeper may only signal a gated
///         flow. It cannot move funds, and flows still run if no keeper is set.
contract VaultFactory is Ownable2Step {
    address public immutable flowImplementation;
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
        allowlist = allowlist_;
        flowImplementation = implementation;
    }

    function createVault() external returns (address vault) {
        if (vaultOf[msg.sender] != address(0)) revert VaultExists();
        vault = Clones.clone(flowImplementation);
        FlowVault(payable(vault)).initialize(msg.sender, address(this));
        vaultOf[msg.sender] = vault;
        emit VaultCreated(msg.sender, vault);
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
