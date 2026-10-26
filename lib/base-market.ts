import type { Address } from "viem";

/**
 * Base mainnet market config. Addresses were read from the live chain on 26 Oct 2026
 * and matched to the publishers below. Do not point these at another network.
 *
 * USDC — Circle native USDC. symbol() is USDC, decimals() is 6.
 *   https://developers.circle.com/stablecoins/usdc-contract-addresses
 *   USDCx.getUnderlyingToken() returns this same address.
 * USDT — Tether on Base. symbol() is USDT, decimals() is 6.
 *   https://basescan.org/token/0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2
 * WETH — the Base wrapped-ether predeploy. symbol() is WETH.
 * SwapRouter02, QuoterV2, UniswapV3Factory, Permit2 —
 *   https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments
 * Chainlink ETH/USD, USDC/USD, USDT/USD — description() matches, decimals() is 8.
 *   https://data.chain.link/feeds/base/mainnet/eth-usd
 *
 * Permit2 is listed because it is the canonical approval contract. This app approves
 * SwapRouter02 directly, so a payment does not need a Permit2 signature.
 */
export const baseMarket = {
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
  usdt: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2" as Address,
  weth: "0x4200000000000000000000000000000000000006" as Address,
  usdcx: "0xD04383398dD2426297da660F9CCA3d439AF9ce1b" as Address,
  ethx: "0x46fd5cfB4c12D87acD3a13e92BAa53240C661D93" as Address,
  swapRouter02: "0x2626664c2603336E57B271c5C0b26F421741e481" as Address,
  quoterV2: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a" as Address,
  v3Factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD" as Address,
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address,
  chainlink: {
    ethUsd: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70" as Address,
    usdcUsd: "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B" as Address,
    usdtUsd: "0xf19d560eB8d2ADf07BD6D13ed03e1D11215721F9" as Address,
  },
} as const;

/** Uniswap fee tiers. 500 is the deep WETH/USDC pool. 100 is the deep USDT/USDC pool. */
export const poolFees = {
  eth: [500, 3000, 100] as const,
  usdt: [100, 500, 3000] as const,
};

export const PROTOCOL_FEE_BPS = 30;
export const SLIPPAGE_BPS = 50;
export const QUOTE_DEADLINE_SECONDS = 20 * 60;
export const USDC_DECIMALS = 6;
export const SUPER_DECIMALS = 18;
/** 1 unit of 6-decimal USDC upgrades to this many 18-decimal USDCx. */
export const SUPER_UNIT = 10n ** BigInt(SUPER_DECIMALS - USDC_DECIMALS);
