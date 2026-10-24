// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @dev Minimal surfaces over the canonical Superfluid contracts. Selectors match
///      CFAv1Forwarder, GDAv1Forwarder, SuperToken, the host, and governance.
interface ISuperTokenMini {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function upgrade(uint256 amount) external;
    function downgrade(uint256 amount) external;
    function getUnderlyingToken() external view returns (address);
    function getUnderlyingDecimals() external view returns (uint8);
    function toUnderlyingAmount(uint256 amount) external view returns (uint256 underlyingAmount, uint256 adjustedAmount);
    function realtimeBalanceOfNow(address account)
        external
        view
        returns (int256 availableBalance, uint256 deposit, uint256 owedDeposit, uint256 timestamp);
    function isAccountCritical(address account, uint256 timestamp) external view returns (bool);
}

interface ISETHMini {
    function upgradeByETH() external payable;
    function downgradeToETH(uint256 wad) external;
}

interface ICFAv1Forwarder {
    function setFlowrate(address token, address receiver, int96 flowrate) external returns (bool);
    function setFlowrateFrom(address token, address sender, address receiver, int96 flowrate) external returns (bool);
    function getFlowrate(address token, address sender, address receiver) external view returns (int96 flowrate);
    function getAccountFlowrate(address token, address account) external view returns (int96 flowrate);
    function getBufferAmountByFlowrate(address token, int96 flowrate) external view returns (uint256 bufferAmount);
    function getFlowOperatorPermissions(address token, address sender, address flowOperator)
        external
        view
        returns (uint8 permissions, int96 flowrateAllowance);
    function deleteFlow(address token, address sender, address receiver, bytes calldata userData) external returns (bool);
}

interface IGDAv1Forwarder {
    struct PoolConfig {
        bool transferabilityForUnitsOwner;
        bool distributionFromAnyAddress;
    }

    function createPool(address token, address admin, PoolConfig memory config)
        external
        returns (bool success, address pool);
    function updateMemberUnits(address pool, address member, uint128 units, bytes calldata userData)
        external
        returns (bool);
    function claimAll(address pool, address member, bytes calldata userData) external returns (bool);
    function connectPool(address pool, bytes calldata userData) external returns (bool);
    function distribute(address token, address from, address pool, uint256 amount, bytes calldata userData)
        external
        returns (bool);
    function distributeFlow(address token, address from, address pool, int96 flowRate, bytes calldata userData)
        external
        returns (bool);
    function getFlowDistributionFlowRate(address token, address from, address pool) external view returns (int96);
    function getNetFlow(address token, address account) external view returns (int96);
}

interface ISuperfluidHost {
    function getGovernance() external view returns (address);
    function isApp(address app) external view returns (bool);
    function getAgreementClass(bytes32 agreementType) external view returns (address);
    function callAgreement(address agreementClass, bytes calldata callData, bytes calldata userData)
        external
        returns (bytes memory);
}

/// @dev `tryConnectPoolFor` connects `memberAddr`. The forwarder's `connectPool`
///      would record the calling contract instead.
interface IGDAv1Autoconnect {
    function tryConnectPoolFor(address pool, address memberAddr, bytes calldata ctx)
        external
        returns (bool success, bytes memory newCtx);
}

interface ISuperfluidGovernance {
    function getPPPConfig(address host, address superToken)
        external
        view
        returns (uint256 liquidationPeriod, uint256 patricianPeriod);
}

interface ISuperfluidPool {
    function getUnits(address member) external view returns (uint128);
    function getTotalUnits() external view returns (uint128);
    function getTotalAmountReceivedByMember(address member) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}
