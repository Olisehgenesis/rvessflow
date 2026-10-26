import "server-only";

import { decodeFunctionResult, encodeFunctionData, parseAbi, zeroAddress, type Address } from "viem";
import { baseMarket, poolFees, SLIPPAGE_BPS, SUPER_UNIT } from "@/lib/base-market";
import { buildDepositPreview, depositGasUnits, networkFeeUsd8, type DepositPreview } from "@/lib/deposit-math";
import type { PreparedCall } from "@/lib/intent";
import { buildFundCalls, buildWithdrawCalls, quoteDeadline } from "@/lib/pay-build";
import {
  formatAmount,
  formatPrice8,
  formatUsd8,
  fundForNet,
  netSuperForUsd,
  parseUsd,
  protocolFeeOf,
  slippageCeiling,
  slippageFloor,
  wrapForSuper,
  type PayAsset,
  type ReceiveAsset,
} from "@/lib/pay-math";
import { loadPrices, type Prices } from "@/lib/prices";
import { addresses, erc20, factoryAbi, publicClient, stableLabel, streamNeed, vaultAbi } from "@/lib/protocol";

const quoterAbi = parseAbi([
  "function quoteExactOutputSingle((address tokenIn, address tokenOut, uint256 amount, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);

export type QuoteLine = { label: string; value: string };

export type FundQuote = {
  pay: PayAsset;
  underlying: bigint;
  minted: bigint;
  fee: bigint;
  credit: bigint;
  amountIn: bigint;
  amountInMax: bigint;
  feeTier: number;
  /** QuoterV2 gas for the swap. Zero when the deposit does not swap. */
  gasEstimate: bigint;
  prices: Prices;
};

const symbols: Record<PayAsset, string> = { usdc: "USDC", usdt: "USDT", eth: "ETH", usdcx: stableLabel };
const scales: Record<PayAsset, number> = { usdc: 6, usdt: 6, eth: 18, usdcx: 18 };

async function allowance(owner: Address, token: Address, spender: Address) {
  return publicClient.readContract({ address: token, abi: erc20, functionName: "allowance", args: [owner, spender] });
}

async function quoteOutput(pay: "usdt" | "eth", usdcOut: bigint): Promise<{ amountIn: bigint; feeTier: number; gasEstimate: bigint }> {
  const tokenIn = pay === "eth" ? baseMarket.weth : baseMarket.usdt;
  let last = "Uniswap has no price for that swap right now.";
  for (const fee of poolFees[pay]) {
    try {
      const data = encodeFunctionData({
        abi: quoterAbi,
        functionName: "quoteExactOutputSingle",
        args: [{ tokenIn, tokenOut: baseMarket.usdc, amount: usdcOut, fee, sqrtPriceLimitX96: 0n }],
      });
      const raw = await publicClient.call({ to: baseMarket.quoterV2, data });
      if (!raw.data || raw.data === "0x") continue;
      const decoded = decodeFunctionResult({ abi: quoterAbi, functionName: "quoteExactOutputSingle", data: raw.data });
      if (decoded[0] > 0n) return { amountIn: decoded[0], feeTier: fee, gasEstimate: decoded[3] };
    } catch (error) {
      last = error instanceof Error ? error.message : last;
    }
  }
  throw new Error(last);
}

async function quoteInput(receive: "usdt" | "eth", usdcIn: bigint): Promise<{ amountOut: bigint; feeTier: number }> {
  const tokenOut = receive === "eth" ? baseMarket.weth : baseMarket.usdt;
  const tiers = receive === "eth" ? poolFees.eth : poolFees.usdt;
  let last = "Uniswap has no price for that withdrawal.";
  for (const fee of tiers) {
    try {
      const data = encodeFunctionData({
        abi: quoterAbi,
        functionName: "quoteExactInputSingle",
        args: [{ tokenIn: baseMarket.usdc, tokenOut, amountIn: usdcIn, fee, sqrtPriceLimitX96: 0n }],
      });
      const raw = await publicClient.call({ to: baseMarket.quoterV2, data });
      if (!raw.data || raw.data === "0x") continue;
      const decoded = decodeFunctionResult({ abi: quoterAbi, functionName: "quoteExactInputSingle", data: raw.data });
      if (decoded[0] > 0n) return { amountOut: decoded[0], feeTier: fee };
    } catch (error) {
      last = error instanceof Error ? error.message : last;
    }
  }
  throw new Error(last);
}

export async function superForUsd(usd: string): Promise<bigint> {
  const prices = await loadPrices();
  return netSuperForUsd(parseUsd(usd), prices.usdcUsd8);
}

/** `needed` is the USDCx that must end up credited (vault) or sitting in the wallet (lock, group). */
export async function quoteFund(pay: PayAsset, needed: bigint, mode: "vault" | "wallet"): Promise<FundQuote> {
  const prices = await loadPrices();
  const wrapped = wrapForSuper(needed);
  const sized =
    mode === "vault"
      ? fundForNet(needed)
      : { underlying: wrapped.underlying, minted: wrapped.minted, fee: 0n, credit: wrapped.minted };
  if (pay === "usdc") {
    return {
      pay,
      underlying: sized.underlying,
      minted: sized.minted,
      fee: sized.fee,
      credit: sized.credit,
      amountIn: sized.underlying,
      amountInMax: sized.underlying,
      feeTier: 0,
      gasEstimate: 0n,
      prices,
    };
  }
  if (pay === "usdcx") {
    const fee = protocolFeeOf(needed);
    return {
      pay,
      underlying: 0n,
      minted: needed,
      fee,
      credit: needed,
      amountIn: needed + fee,
      amountInMax: needed + fee,
      feeTier: 0,
      gasEstimate: 0n,
      prices,
    };
  }
  const quoted = await quoteOutput(pay, sized.underlying);
  return {
    pay,
    underlying: sized.underlying,
    minted: sized.minted,
    fee: sized.fee,
    credit: sized.credit,
    amountIn: quoted.amountIn,
    amountInMax: slippageCeiling(quoted.amountIn),
    feeTier: quoted.feeTier,
    gasEstimate: quoted.gasEstimate,
    prices,
  };
}

export async function fundingCalls(owner: Address, vault: Address, pay: PayAsset, needed: bigint, mode: "vault" | "wallet"): Promise<PreparedCall[]> {
  if (needed <= 0n) return [];
  const quote = await quoteFund(pay, needed, mode);
  if (pay === "usdcx") {
    if (mode === "wallet") {
      const held = await walletSuper(owner);
      if (held < quote.amountInMax) throw new Error(`Not enough ${stableLabel} in this wallet.`);
      return [];
    }
    const allowanceNow = await allowance(owner, addresses.fusdcx, vault);
    return buildFundCalls({
      payer: owner,
      pay,
      mode,
      vault,
      superToken: addresses.fusdcx,
      underlying: 0n,
      minted: quote.minted,
      amountInMax: quote.amountInMax,
      feeTier: 0,
      deadline: 0n,
      approveRouter: false,
      resetRouterAllowance: false,
      approveWrap: allowanceNow < quote.amountInMax,
    });
  }
  const spender = mode === "vault" ? vault : baseMarket.usdcx;
  const [wrapAllowance, routerAllowance] = await Promise.all([
    allowance(owner, baseMarket.usdc, spender),
    pay === "usdt" ? allowance(owner, baseMarket.usdt, baseMarket.swapRouter02) : Promise.resolve(0n),
  ]);
  return buildFundCalls({
    payer: owner,
    pay,
    mode,
    vault,
    underlying: quote.underlying,
    minted: quote.minted,
    amountInMax: quote.amountInMax,
    feeTier: quote.feeTier,
    deadline: quoteDeadline(Math.floor(Date.now() / 1000)),
    approveRouter: pay === "usdt" && routerAllowance < quote.amountInMax,
    resetRouterAllowance: pay === "usdt" && routerAllowance > 0n && routerAllowance < quote.amountInMax,
    approveWrap: wrapAllowance < quote.underlying,
  });
}

export async function withdrawCalls(owner: Address, vault: Address, superAmount: bigint, receive: ReceiveAsset): Promise<PreparedCall[]> {
  const underlying = superAmount / (10n ** 12n);
  let amountOutMinimum = 0n;
  let feeTier = 500;
  if (receive !== "usdc") {
    const quoted = await quoteInput(receive, underlying);
    amountOutMinimum = slippageFloor(quoted.amountOut);
    feeTier = quoted.feeTier;
  }
  const routerAllowance = receive === "usdc" ? 0n : await allowance(owner, baseMarket.usdc, baseMarket.swapRouter02);
  return buildWithdrawCalls({
    vault,
    payer: owner,
    superAmount,
    receive,
    feeTier,
    deadline: quoteDeadline(Math.floor(Date.now() / 1000)),
    amountOutMinimum,
    approveRouter: receive !== "usdc" && routerAllowance < underlying,
    resetRouterAllowance: receive !== "usdc" && routerAllowance > 0n && routerAllowance < underlying,
  });
}

function usd8OfSuper(superAmount: bigint, usdcUsd8: bigint): bigint {
  return (superAmount * usdcUsd8) / 10n ** 18n;
}

function rateLine(quote: FundQuote): string {
  if (quote.pay === "usdcx") return `1 ${stableLabel} = $${formatPrice8(quote.prices.usdcUsd8)}`;
  if (quote.pay === "usdc" || quote.amountIn <= 0n) return `1 USDC = $${formatPrice8(quote.prices.usdcUsd8)}`;
  const usd8 = (quote.underlying * quote.prices.usdcUsd8) / 1_000_000n;
  const perToken = (usd8 * 10n ** BigInt(scales[quote.pay])) / quote.amountIn;
  return `1 ${symbols[quote.pay]} = $${formatPrice8(perToken)}`;
}

export function fundingLines(quote: FundQuote, heading?: string): QuoteLine[] {
  const lines: QuoteLine[] = [];
  if (heading) lines.push({ label: "You add", value: heading });
  lines.push({ label: "Protocol fee", value: `0.30% · $${formatUsd8(usd8OfSuper(quote.fee, quote.prices.usdcUsd8))}` });
  if (quote.pay !== "usdcx") lines.push({ label: "USDC wrapped", value: formatAmount(quote.underlying, 6, 2) });
  lines.push({
    label: quote.pay === "usdc" || quote.pay === "usdcx" ? "You spend" : "You spend at most",
    value: `${formatAmount(quote.amountInMax, scales[quote.pay], quote.pay === "eth" ? 6 : 2)} ${symbols[quote.pay]}`,
  });
  lines.push({ label: "Rate", value: rateLine(quote) });
  lines.push({ label: "Slippage", value: quote.pay === "usdc" || quote.pay === "usdcx" ? "No swap" : `${(SLIPPAGE_BPS / 100).toFixed(2)}% max` });
  if (quote.pay !== "usdcx") lines.push({ label: "Deadline", value: "20 minutes" });
  return lines;
}

export async function idleSuper(owner: Address): Promise<bigint> {
  const vault = await publicClient.readContract({
    address: addresses.factory,
    abi: factoryAbi,
    functionName: "vaultOf",
    args: [owner],
  });
  if (vault === zeroAddress) return 0n;
  return publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "unallocated", args: [addresses.fusdcx] });
}

export async function walletSuper(owner: Address): Promise<bigint> {
  return publicClient.readContract({ address: addresses.fusdcx, abi: erc20, functionName: "balanceOf", args: [owner] });
}

export async function previewLines(input: {
  pay: PayAsset;
  usd?: string;
  superWei?: string;
  mode: "vault" | "wallet" | "stream";
  duration?: number;
  /** Lock and group pulls add the 0.30% fee on top of the face amount. */
  protocolOnTop?: boolean;
  coveredWei?: string;
  /** Add money deposits the full amount even when the vault already holds some. */
  full?: boolean;
}): Promise<QuoteLine[]> {
  const prices = await loadPrices();
  let face = 0n;
  if (input.superWei) face = BigInt(input.superWei);
  else if (input.usd) face = netSuperForUsd(parseUsd(input.usd), prices.usdcUsd8);
  if (face <= 0n) throw new Error("Enter the amount in USD.");
  const heading = `$${formatUsd8(usd8OfSuper(face, prices.usdcUsd8))}`;
  let needed = face;
  if (input.mode === "stream") {
    const duration = Number(input.duration);
    if (!Number.isInteger(duration) || duration < 60) throw new Error("Pick the end date first.");
    needed = await streamNeed(face, BigInt(duration));
  }
  const pulledFee = input.protocolOnTop ? protocolFeeOf(face) : 0n;
  if (pulledFee > 0n) needed += pulledFee;
  const covered = input.full ? 0n : BigInt(input.coveredWei ?? "0");
  if (covered >= needed) {
    return shownQuote([
      {
        label: "Protocol fee",
        value: pulledFee > 0n ? `0.30% · $${formatUsd8(usd8OfSuper(pulledFee, prices.usdcUsd8))}` : "0.30% · $0.00",
      },
      { label: "You spend", value: "0" },
      { label: "Slippage", value: "No swap" },
    ]);
  }
  const mode = input.mode === "wallet" ? "wallet" : "vault";
  if (input.pay !== "usdc" && input.pay !== "usdcx") {
    const code = await publicClient.getCode({ address: baseMarket.quoterV2 });
    if (!code || code === "0x") return [];
  }
  const quote = await quoteFund(input.pay, needed - covered, mode);
  const lines = fundingLines(quote, heading);
  if (pulledFee > 0n) {
    const index = lines.findIndex((line) => line.label === "Protocol fee");
    const feeLine = { label: "Protocol fee", value: `0.30% · $${formatUsd8(usd8OfSuper(pulledFee, prices.usdcUsd8))}` };
    if (index >= 0) lines[index] = feeLine;
  }
  return shownQuote(lines);
}

const hiddenQuote = new Set(["You add", "Held for the stream", "Already available"]);

function shownQuote(lines: QuoteLine[]): QuoteLine[] {
  return lines.filter((line) => !hiddenQuote.has(line.label));
}

export async function previewWithdraw(usd: string, receive: ReceiveAsset): Promise<QuoteLine[]> {
  const prices = await loadPrices();
  const superAmount = await superForWithdraw(usd);
  if (superAmount <= 0n) throw new Error("Enter the amount in USD.");
  const underlying = superAmount / SUPER_UNIT;
  const heading = `$${formatUsd8(usd8OfSuper(superAmount, prices.usdcUsd8))}`;
  if (receive === "usdc") {
    return [
      { label: "You withdraw", value: heading },
      { label: "You receive", value: `${formatAmount(underlying, 6, 2)} USDC` },
      { label: "Rate", value: `1 USDC = $${formatPrice8(prices.usdcUsd8)}` },
      { label: "Slippage", value: "No swap" },
      { label: "Deadline", value: "None" },
    ];
  }
  const quoted = await quoteInput(receive, underlying);
  const min = slippageFloor(quoted.amountOut);
  const scale = receive === "eth" ? 18 : 6;
  const symbol = receive === "eth" ? "ETH" : "USDT";
  const usd8 = (underlying * prices.usdcUsd8) / 1_000_000n;
  const perToken = quoted.amountOut > 0n ? (usd8 * 10n ** BigInt(scale)) / quoted.amountOut : 0n;
  return [
    { label: "You withdraw", value: heading },
    { label: "You receive at least", value: `${formatAmount(min, scale, receive === "eth" ? 6 : 2)} ${symbol}` },
    { label: "Rate", value: `1 ${symbol} = $${formatPrice8(perToken)}` },
    { label: "Slippage", value: `${(SLIPPAGE_BPS / 100).toFixed(2)}% max` },
    { label: "Deadline", value: "20 minutes" },
  ];
}

export async function superForWithdraw(usd: string): Promise<bigint> {
  const net = await superForUsd(usd);
  return (net / SUPER_UNIT) * SUPER_UNIT;
}

/** Live deposit review: Chainlink prices, a Uniswap quote, and a gas-price network-fee estimate. */
export async function depositPreview(owner: Address, pay: PayAsset, usd: string): Promise<DepositPreview> {
  const micros = parseUsd(usd);
  if (micros <= 0n) throw new Error("Enter the amount in USD.");
  const quote = await quoteFund(pay, await superForUsd(usd), "vault");
  const vault = await publicClient.readContract({
    address: addresses.factory,
    abi: factoryAbi,
    functionName: "vaultOf",
    args: [owner],
  });
  let approveWrap = vault === zeroAddress;
  let approveRouter = false;
  let resetRouter = false;
  try {
    if (vault !== zeroAddress) {
      approveWrap = (await allowance(owner, baseMarket.usdc, vault)) < quote.underlying;
    }
    if (pay === "usdt") {
      const routerAllowance = await allowance(owner, baseMarket.usdt, baseMarket.swapRouter02);
      approveRouter = routerAllowance < quote.amountInMax;
      resetRouter = routerAllowance > 0n && routerAllowance < quote.amountInMax;
    }
  } catch {
    approveWrap = true;
    approveRouter = pay === "usdt";
  }
  let network: bigint | null = null;
  try {
    const fees = await publicClient.estimateFeesPerGas();
    const maxFee = fees.maxFeePerGas ?? 0n;
    if (maxFee > 0n) {
      const gas = depositGasUnits(pay, quote.gasEstimate, { approveWrap, approveRouter, resetRouter });
      network = networkFeeUsd8(gas, maxFee, quote.prices.ethUsd8);
    }
  } catch {
    network = null;
  }
  const tokenUsd8 = pay === "eth" ? quote.prices.ethUsd8 : pay === "usdt" ? quote.prices.usdtUsd8 : quote.prices.usdcUsd8;
  return buildDepositPreview({
    pay,
    typedUsdMicros: micros,
    credit: quote.credit,
    fee: quote.fee,
    underlying: quote.underlying,
    amountIn: quote.amountIn,
    amountInMax: quote.amountInMax,
    usdcUsd8: quote.prices.usdcUsd8,
    tokenUsd8,
    networkFeeUsd8: network,
  });
}
