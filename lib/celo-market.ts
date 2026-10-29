import type { Address } from "viem";

/**
 * Celo mainnet Uniswap v3. Addresses from
 * https://developers.uniswap.org/docs/protocols/v3/deployments/v3-celo-deployments
 *
 * cUSDx wraps Mento USDm. USDT/USDm trades in the 0.01% pool
 * 0x5dc631ad6c26bea1a59fbf2c2680cf3df43d249f.
 */
export const celoMarket = {
  usdc: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as Address,
  usdt: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e" as Address,
  usdm: "0x765DE816845861e75A25fCA122bb6898B8B1282a" as Address,
  cusdx: "0x3AcB9A08697b6Db4cD977e8Ab42b6f24722e6D6e" as Address,
  celo: "0x471EcE3750Da237f93B8E339c536989b8978a438" as Address,
  swapRouter02: "0x5615CDAb10dc425a742d643d949a7F474C01abc4" as Address,
  quoterV2: "0x82825d0554fA07f7FC52Ab63c961F330fdEFa8E8" as Address,
} as const;

export const celoPoolFees = {
  usdt: [100, 500, 3000] as const,
  usdc: [100, 500, 3000] as const,
  eth: [500, 3000, 100] as const,
} as const;
