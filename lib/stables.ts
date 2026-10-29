import type { Address } from "viem";

export type FinderToken = {
  key: string;
  label: string;
  address: Address;
  decimals: number;
  /** Priced at one dollar. Good Dollar is not. */
  pegged: boolean;
  chainId: number;
  network: string;
};

const usdcBase = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const usdtBase = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2" as Address;
const usdmMountain = "0x59D9356E565Ab3A36dD77763Fc0d87fEaf85508C" as Address;

const usdcCelo = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as Address;
const usdtCelo = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e" as Address;
const usdmMento = "0x765DE816845861e75A25fCA122bb6898B8B1282a" as Address;
export const GOOD_DOLLAR = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A" as Address;
const goodDollar = GOOD_DOLLAR;

const catalog: FinderToken[] = [
  { key: "base-usdc", label: "USDC", address: usdcBase, decimals: 6, pegged: true, chainId: 8453, network: "Base" },
  { key: "base-usdt", label: "USDT", address: usdtBase, decimals: 6, pegged: true, chainId: 8453, network: "Base" },
  { key: "base-usdm", label: "USDM", address: usdmMountain, decimals: 18, pegged: true, chainId: 8453, network: "Base" },
  { key: "celo-usdc", label: "USDC", address: usdcCelo, decimals: 6, pegged: true, chainId: 42220, network: "Celo" },
  { key: "celo-usdt", label: "USDT", address: usdtCelo, decimals: 6, pegged: true, chainId: 42220, network: "Celo" },
  { key: "celo-usdm", label: "USDm", address: usdmMento, decimals: 18, pegged: true, chainId: 42220, network: "Celo" },
  { key: "celo-usdm-mountain", label: "USDM", address: usdmMountain, decimals: 18, pegged: true, chainId: 42220, network: "Celo" },
  { key: "celo-gooddollar", label: "G$", address: goodDollar, decimals: 18, pegged: false, chainId: 42220, network: "Celo" },
];

/** USDC and USDT on the chain the app is reading. */
export function cashTokens(chainId: number): { usdc: FinderToken; usdt: FinderToken } {
  const network = chainId === 42220 ? "Celo" : "Base";
  const usdc = chainId === 42220 ? usdcCelo : usdcBase;
  const usdt = chainId === 42220 ? usdtCelo : usdtBase;
  return {
    usdc: { key: "usdc", label: "USDC", address: usdc, decimals: 6, pegged: true, chainId, network },
    usdt: { key: "usdt", label: "USDT", address: usdt, decimals: 6, pegged: true, chainId, network },
  };
}

/** USDC, USDT, USDm, USDM, and Good Dollar on Base and Celo. */
export function finderTokens(): FinderToken[] {
  return catalog;
}
