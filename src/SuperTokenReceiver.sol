// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC1820Registry} from "@openzeppelin/contracts/interfaces/IERC1820Registry.sol";

/// @notice Accepts Super Token transfers. Super Tokens are ERC-777 and revert if a
///         contract recipient has no tokensReceived hook. The hook does no accounting:
///         crediting balances inside it would be re-entrant.
abstract contract SuperTokenReceiver {
    address internal constant ERC1820 = 0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24;
    bytes32 internal constant TOKENS_RECIPIENT = keccak256("ERC777TokensRecipient");
    bytes32 internal constant ERC1820_ACCEPT_MAGIC = keccak256("ERC1820_ACCEPT_MAGIC");

    function _registerSuperTokenReceiver() internal {
        IERC1820Registry(ERC1820).setInterfaceImplementer(address(this), TOKENS_RECIPIENT, address(this));
    }

    function canImplementInterfaceForAddress(bytes32 interfaceHash, address account) external view returns (bytes32) {
        if (account == address(this) && _acceptsInterface(interfaceHash)) return ERC1820_ACCEPT_MAGIC;
        return bytes32(0);
    }

    /// @dev Child contracts can also accept the ERC-777 sender hook.
    function _acceptsInterface(bytes32 interfaceHash) internal view virtual returns (bool) {
        return interfaceHash == TOKENS_RECIPIENT;
    }

    /// @dev Intentionally empty. Deposit paths measure the balance change themselves.
    ///      Overrides must not credit balances here; that would be re-entrant.
    function tokensReceived(address, address, address, uint256, bytes calldata, bytes calldata) external virtual {}
}
