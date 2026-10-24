// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ISuperTokenMini, ICFAv1Forwarder} from "./interfaces/ISuperfluidMini.sol";
import {SuperTokenReceiver} from "./SuperTokenReceiver.sol";

/// @title YieldPayer
/// @notice Sends the admin-funded reward stream. It holds only reward tokens, so a
///         reward stream cannot spend locked principal. The stream is a real CFA
///         flow from this contract to the saver.
contract YieldPayer is SuperTokenReceiver {
    address public immutable lockVault;
    ICFAv1Forwarder public immutable cfa;

    error NotVault();

    constructor(address lockVault_, address cfa_) {
        if (lockVault_ == address(0) || cfa_ == address(0)) revert NotVault();
        lockVault = lockVault_;
        cfa = ICFAv1Forwarder(cfa_);
        _registerSuperTokenReceiver();
    }

    /// @notice Open, replace, or close the CFA stream to `to`. Only the lock vault.
    function setFlow(address token, address to, int96 rate) external {
        if (msg.sender != lockVault) revert NotVault();
        cfa.setFlowrate(token, to, rate);
    }

    /// @notice Send unused reward tokens back. Principal never sits here.
    function returnTokens(address token, address to, uint256 amount) external {
        if (msg.sender != lockVault) revert NotVault();
        ISuperTokenMini(token).transfer(to, amount);
    }

    /// @notice Reward tokens sitting here. Principal never arrives.
    function balance(address token) external view returns (uint256) {
        return ISuperTokenMini(token).balanceOf(address(this));
    }
}
