// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @notice Canonical Superfluid addresses.
/// @dev Verified 22 Oct 2026 from superfluid-finance metadata 1.6.5 and
///      tokenlist 5.48.0 (timestamp 2026-10-06).
///      Forwarders are the same address on Base, Base Sepolia, and Celo.
///      There is no canonical WETH super token. ETHx is the native-asset super token
///      and does not wrap WETH. Base Sepolia has no Circle USDCx; the listed stable
///      super token is fUSDCx over Superfluid's fUSDC (18 decimals), not Circle USDC.
library SuperfluidAddresses {
    address internal constant CFA_V1_FORWARDER = 0xcfA132E353cB4E398080B9700609bb008eceB125;
    address internal constant GDA_V1_FORWARDER = 0x6DA13Bde224A05a288748d857b9e7DDEffd1dE08;

    address internal constant BASE_HOST = 0x4C073B3baB6d8826b8C5b229f3cfdC1eC6E47E74;
    address internal constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address internal constant BASE_USDCX = 0xD04383398dD2426297da660F9CCA3d439AF9ce1b;
    address internal constant BASE_ETHX = 0x46fd5cfB4c12D87acD3a13e92BAa53240C661D93;

    address internal constant CELO_HOST = 0xA4Ff07cF81C02CFD356184879D953970cA957585;
    /// @dev cUSDx wraps Mento USDm (the token historically called cUSD).
    address internal constant CELO_CUSDX = 0x3AcB9A08697b6Db4cD977e8Ab42b6f24722e6D6e;
    address internal constant CELO_CELOX = 0x671425Ae1f272Bc6F79beC3ed5C4b00e9c628240;
    /// @dev SuperGoodDollar Pure Super Token. No wrap. getUnderlyingDecimals reverts.
    address internal constant CELO_G = 0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A;
    /// @dev Celo Sepolia (11142220) is not in Superfluid metadata. The Celo host,
    ///      forwarders, cUSDx, and CELOx have no code there (checked 28 Oct 2026).

    address internal constant BASE_SEPOLIA_HOST = 0x109412E3C84f0539b43d39dB691B08c90f58dC7c;
    address internal constant BASE_SEPOLIA_FUSDC = 0x6B0dacea6a72E759243c99Eaed840DEe9564C194;
    address internal constant BASE_SEPOLIA_FUSDCX = 0x1650581F573eAd727B92073B5Ef8B4f5B94D1648;
    address internal constant BASE_SEPOLIA_ETHX = 0x143ea239159155B408e71CDbE836e8CFD6766732;

    /// @dev Considered and rejected as the scheduler of record. See README.
    address internal constant BASE_FLOW_SCHEDULER = 0xC72CEd15204d02183c83fEbb918b183E400811Ee;
    address internal constant BASE_VESTING_SCHEDULER_V3 = 0x6Bf35A170056eDf9aEba159dce4a640cfCef9312;
    address internal constant BASE_SEPOLIA_VESTING_SCHEDULER_V3 = 0x2D0B7a30bFdED086571D6525762a809ee1049c98;
}
