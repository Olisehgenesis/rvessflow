import { decodeFunctionResult, encodeFunctionData, parseAbi, type Address } from "viem";
import { SLIPPAGE_BPS } from "@/lib/base-market";
import { celoMarket, celoPoolFees } from "@/lib/celo-market";
import { GDX_TOKEN, GDX_USDM, gdxCeloClient, minGdxOut, quoteGdxSwap, type GdxSide } from "@/lib/gdx-reserve";
import type { PreparedCall } from "@/lib/intent";

const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);
const routerAbi = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
]);

export type GdxVia = "usdm" | "usdc" | "usdt" | "celo";

export const gdxVias: { id: GdxVia; label: string }[] = [
  { id: "usdm", label: "USDm" },
  { id: "usdc", label: "USDC" },
  { id: "usdt", label: "USDT" },
  { id: "celo", label: "CELO" },
];

export function isGdxVia(value: string): value is GdxVia {
  return value === "usdm" || value === "usdc" || value === "usdt" || value === "celo";
}

export function readGdxVia(value: string): GdxVia {
  if (!isGdxVia(value)) throw new Error("Pick a token.");
  return value;
}

export function gdxViaSend(via: GdxVia): "celo-usdm" | "celo-usdc" | "celo-usdt" | "celo" {
  if (via === "usdm") return "celo-usdm";
  if (via === "usdc") return "celo-usdc";
  if (via === "usdt") return "celo-usdt";
  return "celo";
}

export function gdxViaFromKey(key: string): GdxVia | null {
  if (key === "celo-usdm") return "usdm";
  if (key === "celo-usdc") return "usdc";
  if (key === "celo-usdt") return "usdt";
  if (key === "celo") return "celo";
  return null;
}

function viaToken(via: Exclude<GdxVia, "usdm">): Address {
  if (via === "usdc") return celoMarket.usdc;
  if (via === "usdt") return celoMarket.usdt;
  return celoMarket.celo;
}

function viaFees(via: Exclude<GdxVia, "usdm">) {
  return via === "celo" ? celoPoolFees.eth : celoPoolFees[via];
}

async function quoteExactIn(tokenIn: Address, tokenOut: Address, amountIn: bigint, fees: readonly number[]) {
  let last = "Uniswap has no price for that token into USDm.";
  for (const fee of fees) {
    try {
      const data = encodeFunctionData({
        abi: quoterAbi,
        functionName: "quoteExactInputSingle",
        args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }],
      });
      const raw = await gdxCeloClient.call({ to: celoMarket.quoterV2, data });
      if (!raw.data || raw.data === "0x") continue;
      const decoded = decodeFunctionResult({ abi: quoterAbi, functionName: "quoteExactInputSingle", data: raw.data });
      if (decoded[0] > 0n) return { amountOut: decoded[0], feeTier: fee };
    } catch (error) {
      last = error instanceof Error ? error.message : last;
    }
  }
  throw new Error(last);
}

export type GdxTradeQuote = {
  via: GdxVia;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  amountOut: bigint;
  minOut: bigint;
  usdm: bigint;
  feeTier: number;
};

export async function quoteGdxTrade(side: GdxSide, via: GdxVia, amountIn: bigint): Promise<GdxTradeQuote> {
  if (via === "usdm") {
    const quoted = await quoteGdxSwap(side, amountIn);
    return {
      via,
      tokenIn: quoted.tokenIn,
      tokenOut: quoted.tokenOut,
      amountIn,
      amountOut: quoted.amountOut,
      minOut: quoted.minOut,
      usdm: amountIn,
      feeTier: 0,
    };
  }
  const token = viaToken(via);
  const fees = viaFees(via);
  if (side === "buy") {
    const hop = await quoteExactIn(token, GDX_USDM, amountIn, fees);
    const usdm = minGdxOut(hop.amountOut);
    const reserve = await quoteGdxSwap("buy", usdm);
    return {
      via,
      tokenIn: token,
      tokenOut: GDX_TOKEN,
      amountIn,
      amountOut: reserve.amountOut,
      minOut: reserve.minOut,
      usdm,
      feeTier: hop.feeTier,
    };
  }
  const reserve = await quoteGdxSwap("sell", amountIn);
  const usdm = reserve.minOut;
  const hop = await quoteExactIn(GDX_USDM, token, usdm, fees);
  return {
    via,
    tokenIn: GDX_TOKEN,
    tokenOut: token,
    amountIn,
    amountOut: hop.amountOut,
    minOut: minGdxOut(hop.amountOut, BigInt(SLIPPAGE_BPS)),
    usdm,
    feeTier: hop.feeTier,
  };
}

export function uniswapExactInCall(
  tokenIn: Address,
  tokenOut: Address,
  fee: number,
  recipient: Address,
  amountIn: bigint,
  amountOutMin: bigint,
): PreparedCall {
  return {
    to: celoMarket.swapRouter02,
    data: encodeFunctionData({
      abi: routerAbi,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn,
          tokenOut,
          fee,
          recipient,
          amountIn,
          amountOutMinimum: amountOutMin,
          sqrtPriceLimitX96: 0n,
        },
      ],
    }),
    value: "0",
  };
}
