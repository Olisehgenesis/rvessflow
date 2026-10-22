// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

interface IVaultFactory {
    function allowlist() external view returns (address);
    function keeper() external view returns (address);
    function vaultOf(address user) external view returns (address);
}
