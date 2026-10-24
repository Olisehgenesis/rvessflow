// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

interface ISafeProxyFactory {
    function createProxyWithNonce(address singleton, bytes calldata initializer, uint256 saltNonce)
        external
        returns (address proxy);
}

/// @title ProtocolDeployer
/// @notice RvessFlow Protocol. One call creates the 2-of-3 owner, then the protocol contracts.
///         The owner address is already written into each proxy's init code. This contract
///         holds no funds and no admin role. The caller only pays for the creation.
contract ProtocolDeployer {
    error CreateFailed();
    error Empty();
    error OwnerMismatch();

    event Deployed(address indexed caller, address indexed owner, address[] created);

    /// @param expectedSafe The 2-of-3 that must own the protocol. Created here when it does not exist yet.
    function deploy(
        address safeFactory,
        address singleton,
        bytes calldata initializer,
        uint256 saltNonce,
        address expectedSafe,
        bytes[] calldata initCodes
    ) external returns (address[] memory created) {
        if (expectedSafe == address(0)) revert CreateFailed();
        address owner = expectedSafe;
        if (expectedSafe.code.length == 0) {
            owner = ISafeProxyFactory(safeFactory).createProxyWithNonce(singleton, initializer, saltNonce);
            if (owner != expectedSafe) revert OwnerMismatch();
        }
        uint256 n = initCodes.length;
        if (n == 0) revert Empty();
        created = new address[](n);
        for (uint256 i; i < n; ++i) {
            created[i] = _create(initCodes[i]);
        }
        emit Deployed(msg.sender, owner, created);
    }

    function _create(bytes calldata initCode) private returns (address deployed) {
        if (initCode.length == 0) revert CreateFailed();
        assembly ("memory-safe") {
            let len := initCode.length
            let data := mload(0x40)
            calldatacopy(data, initCode.offset, len)
            deployed := create(0, data, len)
        }
        if (deployed == address(0)) revert CreateFailed();
    }
}
