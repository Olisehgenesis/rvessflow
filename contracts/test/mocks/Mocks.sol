// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ITokenAllowlist} from "../../src/interfaces/ITokenAllowlist.sol";
import {VaultFactory} from "../../src/VaultFactory.sol";
import {FlowVault} from "../../src/FlowVault.sol";

/// @dev Reports whatever underlying the test wants TokenAllowlist to see.
contract TokenProbe {
    address public underlying;
    uint8 public decimals;

    constructor(address underlying_, uint8 decimals_) {
        underlying = underlying_;
        decimals = decimals_;
    }

    function getUnderlyingToken() external view returns (address) {
        return underlying;
    }

    function getUnderlyingDecimals() external view returns (uint8) {
        return decimals;
    }
}

/// @dev Swapped in through VaultFactory so FlowVault can hit decimal checks the real allowlist refuses to store.
contract MockAllowlist is ITokenAllowlist {
    bool public paused;
    uint8 public decimals;
    address public underlying;
    TokenKind public kind = TokenKind.Wrapper;

    function set(uint8 decimals_, address underlying_, TokenKind kind_) external {
        decimals = decimals_;
        underlying = underlying_;
        kind = kind_;
    }

    function isManager(address) external pure returns (bool) {
        return false;
    }

    function isAllowed(address) external pure returns (bool) {
        return true;
    }

    function kindOf(address) external view returns (TokenKind) {
        return kind;
    }

    function underlyingOf(address) external view returns (address) {
        return underlying;
    }

    function underlyingDecimalsOf(address) external view returns (uint8) {
        return decimals;
    }
}

/// @dev Super-token-shaped balance for fee-on-transfer and reentrancy checks.
contract BalanceToken {
    mapping(address => uint256) public balanceOf;
    address public vault;
    bool public reenter;
    uint256 public fee;

    function configure(address vault_, bool reenter_, uint256 fee_) external {
        vault = vault_;
        reenter = reenter_;
        fee = fee_;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function getUnderlyingToken() external pure returns (address) {
        return address(0);
    }

    function getUnderlyingDecimals() external pure returns (uint8) {
        return 18;
    }

    function isAccountCritical(address, uint256) external pure returns (bool) {
        return false;
    }

    function approve(address, uint256) external pure returns (bool) {
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        balanceOf[from] -= amount;
        if (amount > fee) balanceOf[to] += amount - fee;
        if (reenter) {
            reenter = false;
            FlowVault(payable(vault)).depositSuper(address(this), amount);
        }
        return true;
    }
}

contract EthRejector {
    function create(VaultFactory factory) external returns (FlowVault vault) {
        vault = FlowVault(payable(factory.createVault()));
    }

    function deposit(FlowVault vault, address token) external payable {
        vault.depositNative{value: msg.value}(token);
    }

    function withdraw(FlowVault vault, address token, uint256 amount) external {
        vault.withdrawNative(token, amount);
    }

    receive() external payable {
        revert("no eth");
    }
}
