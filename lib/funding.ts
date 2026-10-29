import "server-only";

import { decodeFunctionResult, encodeFunctionData, parseAbi, zeroAddress, type Address } from "viem";
import { baseMarket, poolFees, SLIPPAGE_BPS, SUPER_UNIT } from "@/lib/base-market";
import { celoMarket, celoPoolFees } from "@/lib/celo-market";
import { buildDepositPreview, depositGasUnits, networkFeeUsd8, type DepositPreview } from "@/lib/deposit-math";
import type { PreparedCall } from "@/lib/intent";
import { buildFundCalls, buildWithdrawCalls, quoteDeadline } from "@/lib/pay-build";
import {
  ceilDiv,
  formatAmount,
  formatPrice8,
  formatUsd8,
  fundForNet,
  grossForNet,
  isSuperPay,
  netSuperForUsd,
  netToken18ForUsd,
  parseUsd,
  protocolFeeOf,
  slippageCeiling,
  slippageFloor,
  spendableProblem,
  wrapForSuper,
  type PayAsset,
  type ReceiveAsset,
} from "@/lib/pay-math";
import { loadPrices, type Prices } from "@/lib/prices";
import { addresses, cfaAbi, erc20, factoryAbi, publicClient, stableLabel, streamNeed, vaultAbi } from "@/lib/protocol";
import { siteSuper, vaultSite, type VaultSite } from "@/lib/vault-site";

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

const symbols: Record<PayAsset, string> = { usdc: "USDC", usdt: "USDT", eth: "ETH", usdcx: stableLabel, gdx: "G$" };
const scales: Record<PayAsset, number> = { usdc: 6, usdt: 6, eth: 18, usdcx: 18, gdx: 18 };

async function allowance(owner: Address, token: Address, spender: Address) {
  return publicClient.readContract({ address: token, abi: erc20, functionName: "allowance", args: [owner, spender] });
}

async function balanceOf(owner: Address, token: Address) {
  return publicClient.readContract({ address: token, abi: erc20, functionName: "balanceOf", args: [owner] });
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

export async function superForUsd(usd: string, pay?: PayAsset): Promise<bigint> {
  const prices = await loadPrices();
  if (pay === "gdx") return netToken18ForUsd(parseUsd(usd), prices.gdxUsd8);
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
  if (pay === "usdcx" || pay === "gdx") {
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

async function requireSpendable(owner: Address, pay: PayAsset, needed: bigint) {
  const balance =
    pay === "eth"
      ? await publicClient.getBalance({ address: owner })
      : await balanceOf(
          owner,
          pay === "usdt" ? baseMarket.usdt : pay === "usdc" ? baseMarket.usdc : pay === "gdx" ? siteSuper(vaultSite(), "gdx") : addresses.fusdcx,
        );
  const problem = spendableProblem({
    symbol: symbols[pay],
    balance,
    needed,
    scale: scales[pay],
    digits: pay === "eth" ? 6 : isSuperPay(pay) ? 4 : 2,
    leaveFee: pay === "eth",
  });
  if (problem) throw new Error(problem);
}

const wrapAbi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function depositUnderlying(address token, uint256 underlyingAmount)",
  "function depositSuper(address token, uint256 amount)",
  "function upgrade(uint256 amount)",
]);
const swapRouterAbi = parseAbi([
  "function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountIn)",
  "function multicall(uint256 deadline, bytes[] data) payable returns (bytes[])",
]);

async function quoteCeloToUsdm(
  site: VaultSite,
  pay: "usdt" | "usdc" | "eth",
  usdmOut: bigint,
): Promise<{ amountIn: bigint; feeTier: number }> {
  const tokenIn = pay === "eth" ? celoMarket.celo : pay === "usdt" ? site.usdt : site.usdc;
  let last = "Celo has no price for that swap right now.";
  for (const fee of celoPoolFees[pay]) {
    try {
      const data = encodeFunctionData({
        abi: quoterAbi,
        functionName: "quoteExactOutputSingle",
        args: [{ tokenIn, tokenOut: site.wrap, amount: usdmOut, fee, sqrtPriceLimitX96: 0n }],
      });
      const raw = await site.client.call({ to: celoMarket.quoterV2, data });
      if (!raw.data || raw.data === "0x") continue;
      const decoded = decodeFunctionResult({ abi: quoterAbi, functionName: "quoteExactOutputSingle", data: raw.data });
      if (decoded[0] > 0n) return { amountIn: decoded[0], feeTier: fee };
    } catch (error) {
      last = error instanceof Error ? error.message : last;
    }
  }
  throw new Error(last);
}

async function streamNeedOn(site: VaultSite, amount: bigint, duration: bigint, token = site.fusdcx): Promise<bigint> {
  const perSecond = amount / duration;
  if (perSecond === 0n) throw new Error("That duration is too long for this amount. The stream would be less than 1 wei per second.");
  const reserved = perSecond * duration;
  const buffer = await site.client.readContract({
    address: site.cfa,
    abi: cfaAbi,
    functionName: "getBufferAmountByFlowrate",
    args: [token, perSecond],
  });
  return reserved + buffer * 2n + perSecond * 3600n;
}

function fundCall(
  to: Address,
  functionName: "approve" | "depositSuper" | "depositUnderlying" | "upgrade",
  args: readonly unknown[],
): PreparedCall {
  return {
    to,
    data: encodeFunctionData({ abi: wrapAbi, functionName, args: args as never }),
    value: "0",
  };
}

/** Celo (and any site without Uniswap wrap) deposits super or the Superfluid underlying. */
async function wrapSiteCalls(
  site: VaultSite,
  owner: Address,
  vault: Address,
  pay: PayAsset,
  needed: bigint,
  mode: "vault" | "wallet",
): Promise<PreparedCall[]> {
  if (needed <= 0n) return [];
  if (isSuperPay(pay)) {
    if (mode === "wallet") return [];
    const token = siteSuper(site, pay);
    const due = needed + protocolFeeOf(needed);
    const allowanceNow = await site.client.readContract({
      address: token,
      abi: wrapAbi,
      functionName: "allowance",
      args: [owner, vault],
    });
    const calls: PreparedCall[] = [];
    if (allowanceNow < due) calls.push(fundCall(token, "approve", [vault, due]));
    calls.push(fundCall(vault, "depositSuper", [token, needed]));
    return calls;
  }
  const minted = grossForNet(needed);
  const wrapDecimals = Number(
    await site.client.readContract({ address: site.wrap, abi: wrapAbi, functionName: "decimals" }),
  );
  const wrapScale = wrapDecimals >= 18 ? 1n : 10n ** BigInt(18 - wrapDecimals);
  const usdmOut = wrapDecimals >= 18 ? minted : ceilDiv(minted, wrapScale);
  if (usdmOut <= 0n) throw new Error("Enter a larger amount.");
  const spender = mode === "vault" ? vault : site.fusdcx;
  const calls: PreparedCall[] = [];

  const direct = pay === "usdc" && site.net === "celo" ? site.wrap : pay === "usdc" ? site.usdc : null;
  if (direct) {
    const decimals = Number(await site.client.readContract({ address: direct, abi: wrapAbi, functionName: "decimals" }));
    const scale = decimals >= 18 ? 1n : 10n ** BigInt(18 - decimals);
    const underlying = decimals >= 18 ? minted : ceilDiv(minted, scale);
    const balance = await site.client.readContract({ address: direct, abi: wrapAbi, functionName: "balanceOf", args: [owner] });
    const symbol = site.net === "celo" ? "USDm" : "USDC";
    const problem = spendableProblem({ symbol, balance, needed: underlying, scale: decimals, digits: decimals > 6 ? 4 : 2, leaveFee: false });
    if (problem) throw new Error(problem);
    const allowanceNow = await site.client.readContract({ address: direct, abi: wrapAbi, functionName: "allowance", args: [owner, spender] });
    if (allowanceNow < underlying) calls.push(fundCall(direct, "approve", [spender, underlying]));
    if (mode === "vault") calls.push(fundCall(vault, "depositUnderlying", [site.fusdcx, underlying]));
    else calls.push(fundCall(site.fusdcx, "upgrade", [minted]));
    return calls;
  }

  if (pay !== "usdt" && pay !== "eth") throw new Error("Pay with a dollar token on this chain.");
  const token = pay === "usdt" ? site.usdt : celoMarket.celo;
  const quoted = await quoteCeloToUsdm(site, pay, usdmOut);
  const amountInMax = slippageCeiling(quoted.amountIn);
  const decimals = pay === "usdt" ? 6 : 18;
  const balance = await site.client.readContract({ address: token, abi: wrapAbi, functionName: "balanceOf", args: [owner] });
  const problem = spendableProblem({
    symbol: pay === "usdt" ? "USDT" : "CELO",
    balance,
    needed: amountInMax,
    scale: decimals,
    digits: pay === "usdt" ? 2 : 6,
    leaveFee: pay === "eth",
  });
  if (problem) throw new Error(problem);
  const routerAllowance = await site.client.readContract({
    address: token,
    abi: wrapAbi,
    functionName: "allowance",
    args: [owner, celoMarket.swapRouter02],
  });
  if (pay === "usdt" && routerAllowance > 0n && routerAllowance < amountInMax) {
    calls.push(fundCall(token, "approve", [celoMarket.swapRouter02, 0n]));
  }
  if (routerAllowance < amountInMax) calls.push(fundCall(token, "approve", [celoMarket.swapRouter02, amountInMax]));
  const swap = encodeFunctionData({
    abi: swapRouterAbi,
    functionName: "exactOutputSingle",
    args: [
      {
        tokenIn: token,
        tokenOut: site.wrap,
        fee: quoted.feeTier,
        recipient: owner,
        amountOut: usdmOut,
        amountInMaximum: amountInMax,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
  calls.push({
    to: celoMarket.swapRouter02,
    data: encodeFunctionData({
      abi: swapRouterAbi,
      functionName: "multicall",
      args: [quoteDeadline(Math.floor(Date.now() / 1000)), [swap]],
    }),
    value: "0",
  });
  const wrapAllowance = await site.client.readContract({
    address: site.wrap,
    abi: wrapAbi,
    functionName: "allowance",
    args: [owner, spender],
  });
  if (wrapAllowance < usdmOut) calls.push(fundCall(site.wrap, "approve", [spender, usdmOut]));
  if (mode === "vault") calls.push(fundCall(vault, "depositUnderlying", [site.fusdcx, usdmOut]));
  else calls.push(fundCall(site.fusdcx, "upgrade", [minted]));
  return calls;
}

export async function fundingCalls(
  owner: Address,
  vault: Address,
  pay: PayAsset,
  needed: bigint,
  mode: "vault" | "wallet",
  site?: VaultSite,
): Promise<PreparedCall[]> {
  if (needed <= 0n) return [];
  if (site && site.chainId !== 8453 && site.chainId !== 84532) {
    return wrapSiteCalls(site, owner, vault, pay, needed, mode);
  }
  const quote = await quoteFund(pay, needed, mode);
  await requireSpendable(owner, pay, quote.amountInMax);
  if (isSuperPay(pay)) {
    if (mode === "wallet") return [];
    const token = siteSuper(site ?? vaultSite(), pay);
    const allowanceNow = await allowance(owner, token, vault);
    return buildFundCalls({
      payer: owner,
      pay,
      mode,
      vault,
      superToken: token,
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
  if (quote.pay === "gdx") return `1 G$ = $${formatPrice8(quote.prices.gdxUsd8)}`;
  if (quote.pay === "usdcx") return `1 ${stableLabel} = $${formatPrice8(quote.prices.usdcUsd8)}`;
  if (quote.pay === "usdc" || quote.amountIn <= 0n) return `1 USDC = $${formatPrice8(quote.prices.usdcUsd8)}`;
  const usd8 = (quote.underlying * quote.prices.usdcUsd8) / 1_000_000n;
  const perToken = (usd8 * 10n ** BigInt(scales[quote.pay])) / quote.amountIn;
  return `1 ${symbols[quote.pay]} = $${formatPrice8(perToken)}`;
}

export function fundingLines(quote: FundQuote, heading?: string): QuoteLine[] {
  const lines: QuoteLine[] = [];
  if (heading) lines.push({ label: "You add", value: heading });
  const feePrice = quote.pay === "gdx" ? quote.prices.gdxUsd8 : quote.prices.usdcUsd8;
  lines.push({ label: "Protocol fee", value: `0.30% · $${formatUsd8(usd8OfSuper(quote.fee, feePrice))}` });
  if (!isSuperPay(quote.pay)) lines.push({ label: "USDC wrapped", value: formatAmount(quote.underlying, 6, 2) });
  lines.push({
    label: quote.pay === "usdc" || isSuperPay(quote.pay) ? "You spend" : "You spend at most",
    value: `${formatAmount(quote.amountInMax, scales[quote.pay], quote.pay === "eth" || quote.pay === "gdx" ? 6 : 2)} ${symbols[quote.pay]}`,
  });
  lines.push({ label: "Rate", value: rateLine(quote) });
  lines.push({ label: "Slippage", value: quote.pay === "usdc" || isSuperPay(quote.pay) ? "No swap" : `${(SLIPPAGE_BPS / 100).toFixed(2)}% max` });
  if (!isSuperPay(quote.pay)) lines.push({ label: "Deadline", value: "20 minutes" });
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
  network?: string;
}): Promise<QuoteLine[]> {
  const prices = await loadPrices();
  let face = 0n;
  if (input.superWei) face = BigInt(input.superWei);
  else if (input.usd) {
    face = input.pay === "gdx" ? netToken18ForUsd(parseUsd(input.usd), prices.gdxUsd8) : netSuperForUsd(parseUsd(input.usd), prices.usdcUsd8);
  }
  if (face <= 0n) throw new Error("Enter the amount in USD.");
  const facePrice = input.pay === "gdx" ? prices.gdxUsd8 : prices.usdcUsd8;
  const heading = `$${formatUsd8(usd8OfSuper(face, facePrice))}`;
  let needed = face;
  if (input.mode === "stream") {
    const duration = Number(input.duration);
    if (!Number.isInteger(duration) || duration < 60) throw new Error("Pick the end date first.");
    needed =
      input.network && /celo/i.test(input.network)
        ? await streamNeedOn(vaultSite("celo"), face, BigInt(duration), siteSuper(vaultSite("celo"), input.pay))
        : await streamNeed(face, BigInt(duration));
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
  if (input.network && /celo/i.test(input.network)) {
    const short = needed - covered;
    const minted = grossForNet(short);
    const fee = protocolFeeOf(minted);
    if (input.pay === "gdx") {
      return shownQuote([
        { label: "You spend", value: `${formatAmount(short, 18, 4)} G$` },
        { label: "Protocol fee", value: `0.30% · $${formatUsd8(usd8OfSuper(protocolFeeOf(short), prices.gdxUsd8))}` },
        { label: "Slippage", value: "No swap" },
      ]);
    }
    if (input.pay === "usdcx" || input.pay === "usdc") {
      const symbol = input.pay === "usdcx" ? "cUSDx" : "USDm";
      return shownQuote([
        { label: "You spend", value: `${formatAmount(minted, 18, 4)} ${symbol}` },
        { label: "Protocol fee", value: `0.30% · $${formatUsd8(usd8OfSuper(fee, prices.usdcUsd8))}` },
        { label: "Slippage", value: "No swap" },
      ]);
    }
    const site = vaultSite("celo");
    const quoted = await quoteCeloToUsdm(site, input.pay === "eth" ? "eth" : "usdt", minted);
    const amountInMax = slippageCeiling(quoted.amountIn);
    const scale = input.pay === "eth" ? 18 : 6;
    const digits = input.pay === "eth" ? 6 : 2;
    const symbol = input.pay === "eth" ? "CELO" : "USDT";
    return shownQuote([
      { label: "You spend", value: `${formatAmount(amountInMax, scale, digits)} ${symbol}` },
      { label: "Protocol fee", value: `0.30% · $${formatUsd8(usd8OfSuper(fee, prices.usdcUsd8))}` },
      { label: "Slippage", value: "0.50%" },
    ]);
  }
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
  const quote = await quoteFund(pay, await superForUsd(usd, pay), "vault");
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
  const tokenUsd8 = pay === "eth" ? quote.prices.ethUsd8 : pay === "usdt" ? quote.prices.usdtUsd8 : pay === "gdx" ? quote.prices.gdxUsd8 : quote.prices.usdcUsd8;
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
