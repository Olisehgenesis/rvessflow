// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ISuperTokenMini, ICFAv1Forwarder} from "./interfaces/ISuperfluidMini.sol";
import {SuperTokenReceiver} from "./SuperTokenReceiver.sol";

/// @title FlowConduit
/// @notice One Superfluid CFA sender per logical flow. The vault streams to this
///         conduit and the conduit streams to the person, so two buckets can pay
///         the same wallet. CFA allows only one flow between a pair of addresses.
contract FlowConduit is Initializable, SuperTokenReceiver {
    address public immutable cfaForwarder;

    address public vault;
    address public token;
    address public recipient;
    int96 public rate;

    error NotVault();
    error AlreadyInitialized();

    constructor(address cfaForwarder_) {
        if (cfaForwarder_ == address(0)) revert NotVault();
        cfaForwarder = cfaForwarder_;
        _disableInitializers();
    }

    function initialize(address vault_, address token_) external initializer {
        if (vault_ == address(0) || token_ == address(0)) revert NotVault();
        vault = vault_;
        token = token_;
        _registerSuperTokenReceiver();
    }

    /// @notice Open or replace the CFA stream to `recipient_`.
    function setStream(address recipient_, int96 rate_) external {
        if (msg.sender != vault) revert NotVault();
        recipient = recipient_;
        rate = rate_;
        ICFAv1Forwarder(cfaForwarder).setFlowrate(token, recipient_, rate_);
    }

    /// @notice Delete the outward stream and return every super token here to the vault.
    function close() external returns (uint256 returned) {
        if (msg.sender != vault) revert NotVault();
        if (recipient != address(0)) {
            ICFAv1Forwarder(cfaForwarder).setFlowrate(token, recipient, 0);
        }
        rate = 0;
        returned = ISuperTokenMini(token).balanceOf(address(this));
        if (returned != 0) {
            ISuperTokenMini(token).transfer(vault, returned);
        }
    }
}
