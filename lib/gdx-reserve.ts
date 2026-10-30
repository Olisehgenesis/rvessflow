import { createPublicClient, parseAbi, type Address, type Hex } from "viem";
import { celo } from "viem/chains";
import { celoTransport } from "@/lib/network";
import { GOOD_DOLLAR } from "@/lib/stables";

/** GoodDollar V4 Mento Reserve on Celo. Bonding-curve buy/sell, not the thin Uniswap pool. */
export const GDX_RESERVE = "0x94A3240f484A04F5e3d524f528d02694c109463b" as Address;
export const GDX_BROKER = "0x88de45906D4F5a57315c133620cfa484cB297541" as Address;
export const GDX_EXCHANGE_PROVIDER = "0x2fFBB49055d487DdBBb0C052Cd7c2a02A7971e41" as Address;
export const GDX_EXCHANGE_ID =
  "0xba77f5c7bb3317643c6d81d1ef3f9913561741d92095f88efa402faf2cbe9124" as Hex;
export const GDX_USDM = "0x765DE816845861e75A25fCA122bb6898B8B1282a" as Address;
export const GDX_TOKEN = GOOD_DOLLAR;

/** 0.50% below the quoted out amount. Exit contribution is already inside sell quotes. */
export const GDX_SLIPPAGE_BPS = 50n;
/** Exit contribution is 10_000_000 / 1e8 = 10% of G$ sold. */
export const GDX_EXIT_CONTRIBUTION = 10_000_000n;
export const GDX_RATIO_SCALE = 100_000_000n;

export const gdxBrokerAbi = parseAbi([
  "function getAmountOut(address exchangeProvider, bytes32 exchangeId, address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256 amountOut)",
  "function swapIn(address exchangeProvider, bytes32 exchangeId, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin) returns (uint256 amountOut)",
  "function getExchangeProviders() view returns (address[])",
]);

export const gdxProviderAbi = parseAbi([
  "function currentPrice(bytes32 exchangeId) view returns (uint256 price)",
  "function getPoolExchange(bytes32 exchangeId) view returns ((address reserveAsset, address tokenAddress, uint256 tokenSupply, uint256 reserveBalance, uint32 reserveRatio, uint32 exitContribution))",
]);

export type GdxSide = "buy" | "sell";

export function isGdxSide(value: string): value is GdxSide {
  return value === "buy" || value === "sell";
}

export function readGdxSide(value: string): GdxSide {
  if (!isGdxSide(value)) throw new Error("Pick buy or sell.");
  return value;
}

export function gdxPair(side: GdxSide): { tokenIn: Address; tokenOut: Address; inAsset: "celo-usdm" | "celo-gdx"; outAsset: "celo-usdm" | "celo-gdx" } {
  if (side === "buy") {
    return { tokenIn: GDX_USDM, tokenOut: GDX_TOKEN, inAsset: "celo-usdm", outAsset: "celo-gdx" };
  }
  return { tokenIn: GDX_TOKEN, tokenOut: GDX_USDM, inAsset: "celo-gdx", outAsset: "celo-usdm" };
}

/** `currentPrice` is 18-decimal USDm per G$. USDm is one dollar. */
export function gdxUsd8FromPrice(price18: bigint): bigint {
  if (price18 <= 0n) return 0n;
  return price18 / 10n ** 10n;
}

export function minGdxOut(amountOut: bigint, bps = GDX_SLIPPAGE_BPS): bigint {
  if (amountOut <= 0n) return 0n;
  const cut = (amountOut * bps) / 10_000n;
  return amountOut > cut ? amountOut - cut : 0n;
}

export function exitContributionPct(raw = GDX_EXIT_CONTRIBUTION): number {
  return Number((raw * 100n) / GDX_RATIO_SCALE);
}

export const gdxCeloClient = createPublicClient({ chain: celo, transport: celoTransport() });

export async function readGdxUsd8(): Promise<bigint> {
  const price = await gdxCeloClient.readContract({
    address: GDX_EXCHANGE_PROVIDER,
    abi: gdxProviderAbi,
    functionName: "currentPrice",
    args: [GDX_EXCHANGE_ID],
  });
  return gdxUsd8FromPrice(price);
}

export async function quoteGdxSwap(side: GdxSide, amountIn: bigint) {
  if (amountIn <= 0n) throw new Error("Enter an amount greater than zero.");
  const pair = gdxPair(side);
  const amountOut = await gdxCeloClient.readContract({
    address: GDX_BROKER,
    abi: gdxBrokerAbi,
    functionName: "getAmountOut",
    args: [GDX_EXCHANGE_PROVIDER, GDX_EXCHANGE_ID, pair.tokenIn, pair.tokenOut, amountIn],
  });
  if (amountOut <= 0n) throw new Error("The reserve quoted nothing for that amount.");
  return {
    ...pair,
    amountIn,
    amountOut,
    minOut: minGdxOut(amountOut),
  };
}
