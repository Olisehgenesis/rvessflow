// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ISuperTokenMini} from "./interfaces/ISuperfluidMini.sol";
import {ITokenAllowlist} from "./interfaces/ITokenAllowlist.sol";

/// @title TokenAllowlist
/// @notice Super Tokens a vault, lock, or chama may hold. The admin pauses new
///         positions. Pause does not block settle, protect, or withdraw.
contract TokenAllowlist is Ownable2Step, ITokenAllowlist {
    struct Config {
        bool allowed;
        TokenKind kind;
        address underlying;
        uint8 underlyingDecimals;
        bool exists;
    }

    mapping(address superToken => Config config) private _tokens;
    bool public paused;

    event SuperTokenSet(address indexed superToken, bool allowed, TokenKind kind, address underlying, uint8 decimals);
    event PausedSet(bool paused);

    error ZeroAddress();
    error TokenMismatch();
    error BadDecimals();

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PausedSet(paused_);
    }

    /// @notice Register a super token. Wrapper entries must match the token's own
    ///         underlying address and decimals, so USDC (6) cannot be stored as 18.
    function setSuperToken(address superToken, bool allowed, TokenKind kind) external onlyOwner {
        if (superToken == address(0)) revert ZeroAddress();
        address underlying = ISuperTokenMini(superToken).getUnderlyingToken();
        uint8 decimals = ISuperTokenMini(superToken).getUnderlyingDecimals();
        if (kind == TokenKind.Wrapper) {
            if (underlying == address(0) || decimals == 0 || decimals > 18) revert BadDecimals();
        } else if (underlying != address(0)) {
            revert TokenMismatch();
        }
        _tokens[superToken] = Config({
            allowed: allowed,
            kind: kind,
            underlying: underlying,
            underlyingDecimals: decimals,
            exists: true
        });
        emit SuperTokenSet(superToken, allowed, kind, underlying, decimals);
    }

    function isAllowed(address superToken) external view returns (bool) {
        return _tokens[superToken].allowed;
    }

    function kindOf(address superToken) external view returns (TokenKind) {
        return _tokens[superToken].kind;
    }

    function underlyingOf(address superToken) external view returns (address) {
        return _tokens[superToken].underlying;
    }

    function underlyingDecimalsOf(address superToken) external view returns (uint8) {
        return _tokens[superToken].underlyingDecimals;
    }
}
