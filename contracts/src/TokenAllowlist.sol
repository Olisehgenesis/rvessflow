// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {ISuperTokenMini} from "./interfaces/ISuperfluidMini.sol";
import {ITokenAllowlist} from "./interfaces/ITokenAllowlist.sol";

/// @title TokenAllowlist
/// @notice RvessFlow Protocol. Super Tokens a vault, lock, or chama may hold.
///         The owner pauses and unpauses new positions. A support manager can pause,
///         and cannot reopen them. Pause does not block settle, protect, or withdraw.
contract TokenAllowlist is Initializable, Ownable2Step, UUPSUpgradeable, ITokenAllowlist {
    struct Config {
        bool allowed;
        TokenKind kind;
        address underlying;
        uint8 underlyingDecimals;
        bool exists;
    }

    mapping(address superToken => Config config) private _tokens;
    bool public paused;
    uint64 public constant UPGRADE_DELAY = 6 hours;
    address public pendingImplementation;
    uint64 public upgradeReadyAt;
    /// @dev Support staff. Appended after the original layout so an upgrade keeps existing slots.
    mapping(address account => bool) public isManager;
    address[] private _managers;

    event SuperTokenSet(address indexed superToken, bool allowed, TokenKind kind, address underlying, uint8 decimals);
    event PausedSet(bool paused);
    event ManagerSet(address indexed account, bool allowed);

    error ZeroAddress();
    error TokenMismatch();
    error BadDecimals();
    error UpgradeNotReady();
    error NotManager();

    constructor(address initialOwner) Ownable(initialOwner) {
        _disableInitializers();
    }

    function initialize(address initialOwner) external initializer {
        if (initialOwner == address(0)) revert ZeroAddress();
        _transferOwnership(initialOwner);
    }

    /// @notice First setup for a fresh proxy. Registers the two tokens, then names the owner.
    ///         Later changes still go through {setSuperToken}, which only the owner can call.
    function initialize(
        address initialOwner,
        address stable,
        TokenKind stableKind,
        address eth,
        TokenKind ethKind
    ) external initializer {
        if (initialOwner == address(0) || stable == address(0) || eth == address(0)) revert ZeroAddress();
        _setSuperToken(stable, true, stableKind);
        _setSuperToken(eth, true, ethKind);
        _transferOwnership(initialOwner);
    }

    /// @notice Same as the two-token setup, plus a Pure Super Token such as G$.
    function initialize(
        address initialOwner,
        address stable,
        TokenKind stableKind,
        address eth,
        TokenKind ethKind,
        address extra,
        TokenKind extraKind
    ) external initializer {
        if (initialOwner == address(0) || stable == address(0) || eth == address(0)) revert ZeroAddress();
        _setSuperToken(stable, true, stableKind);
        _setSuperToken(eth, true, ethKind);
        if (extra != address(0)) _setSuperToken(extra, true, extraKind);
        _transferOwnership(initialOwner);
    }

    function contractVersion() public pure virtual returns (uint256) {
        return 4;
    }

    function scheduleUpgrade(address newImplementation) external onlyOwner {
        if (newImplementation == address(0)) revert ZeroAddress();
        pendingImplementation = newImplementation;
        upgradeReadyAt = uint64(block.timestamp) + UPGRADE_DELAY;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        if (newImplementation != pendingImplementation || block.timestamp < upgradeReadyAt) revert UpgradeNotReady();
    }

    /// @notice Add or remove a support manager. Only the owner, which should be a Safe, can do this.
    ///         A manager can pause new positions and pause a group. A manager cannot upgrade,
    ///         change the token list, change a penalty, or withdraw fees.
    function setManager(address account, bool allowed) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        if (isManager[account] == allowed) return;
        isManager[account] = allowed;
        if (allowed) {
            _managers.push(account);
        } else {
            uint256 n = _managers.length;
            for (uint256 i; i < n; ++i) {
                if (_managers[i] != account) continue;
                _managers[i] = _managers[n - 1];
                _managers.pop();
                break;
            }
        }
        emit ManagerSet(account, allowed);
    }

    function managerCount() external view returns (uint256) {
        return _managers.length;
    }

    function managerAt(uint256 index) external view returns (address) {
        return _managers[index];
    }

    /// @notice Stop new flows, locks, and groups. The owner may also reopen them.
    ///         A support manager may only pause. Settle, protect, and withdraw keep working.
    function setPaused(bool paused_) external {
        if (msg.sender != owner() && (!paused_ || !isManager[msg.sender])) revert NotManager();
        paused = paused_;
        emit PausedSet(paused_);
    }

    /// @notice Add or remove a super token. The owner Safe can do this at any time.
    ///         It does not schedule an upgrade. Wrapper entries must match the token's own
    ///         underlying address and decimals, so USDC (6) cannot be stored as 18.
    ///         Pure Super Tokens such as G$ may omit getUnderlyingDecimals.
    function setSuperToken(address superToken, bool allowed, TokenKind kind) external onlyOwner {
        _setSuperToken(superToken, allowed, kind);
    }

    function _setSuperToken(address superToken, bool allowed, TokenKind kind) internal {
        if (superToken == address(0)) revert ZeroAddress();
        address underlying = ISuperTokenMini(superToken).getUnderlyingToken();
        uint8 decimals;
        try ISuperTokenMini(superToken).getUnderlyingDecimals() returns (uint8 reported) {
            decimals = reported;
        } catch {
            decimals = 0;
        }
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
