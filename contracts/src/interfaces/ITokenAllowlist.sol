// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

interface ITokenAllowlist {
    enum TokenKind {
        Wrapper,
        Native,
        Pure
    }

    function isAllowed(address superToken) external view returns (bool);
    function paused() external view returns (bool);
    function isManager(address account) external view returns (bool);
    function kindOf(address superToken) external view returns (TokenKind);
    function underlyingOf(address superToken) external view returns (address);
    function underlyingDecimalsOf(address superToken) external view returns (uint8);
}
