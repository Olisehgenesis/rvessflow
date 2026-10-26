import { PROTOCOL_FEE_BPS, QUOTE_DEADLINE_SECONDS, SLIPPAGE_BPS } from "@/lib/base-market";
import { formatAmount, formatPrice8, formatUsd8, type PayAsset } from "@/lib/pay-math";

export const basescan = "https://basescan.org";

/** Adverse price impact at or under this (1%) is treated as inside the safe range. */
export const PRICE_IMPACT_SAFE_BPS = 100n;

/**
 * Gas units used only to estimate the network fee. The dollar amount is still
 * this estimate times the live base fee and the ETH/USD price.
 */
const DEPOSIT_GAS = 160_000n;
const APPROVE_GAS = 46_000n;
const USDT_RESET_GAS = 30_000n;
const SWAP_OVERHEAD_GAS = 90_000n;
const SWAP_FALLBACK_GAS = 180_000n;

export const depositTokenMeta: Record<PayAsset, { symbol: string; name: string }> = {
  usdc: { symbol: "USDC", name: "USD Coin" },
  usdt: { symbol: "USDT", name: "Tether USD" },
  eth: { symbol: "ETH", name: "Ethereum" },
};

export type TokenFilter = "all" | "stable" | "popular" | "other";

const filters: Record<TokenFilter, PayAsset[]> = {
  all: ["usdc", "usdt", "eth"],
  stable: ["usdc", "usdt"],
  popular: ["usdc", "eth"],
  other: [],
};

export function tokenScale(pay: PayAsset): number {
  return pay === "eth" ? 18 : 6;
}

export function matchesToken(pay: PayAsset, filter: TokenFilter, query: string): boolean {
  if (!filters[filter].includes(pay)) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const meta = depositTokenMeta[pay];
  return meta.symbol.toLowerCase().includes(q) || meta.name.toLowerCase().includes(q);
}

export function readDepositQuery(pay: string | undefined, usd: string | undefined): { pay: PayAsset; usd: string } {
  const asset: PayAsset = pay === "usdt" || pay === "eth" ? pay : "usdc";
  const amount = usd && /^\d+(\.\d{1,2})?$/.test(usd) ? usd : "";
  return { pay: asset, usd: amount };
}

export function depositHref(path: string, pay: PayAsset, usd: string): string {
  const query = new URLSearchParams();
  query.set("pay", pay);
  if (usd) query.set("usd", usd);
  return `${path}?${query.toString()}`;
}

/** Floor a Chainlink 8-decimal dollar value to a USD input (two decimals). */
export function maxUsdInput(usd8: bigint): string {
  if (usd8 <= 0n) return "0.00";
  const cents = usd8 / 1_000_000n;
  const whole = cents / 100n;
  const frac = (cents % 100n).toString().padStart(2, "0");
  return `${whole}.${frac}`;
}

export function depositGasUnits(
  pay: PayAsset,
  swapGas: bigint,
  flags: { approveWrap: boolean; approveRouter: boolean; resetRouter: boolean },
): bigint {
  let gas = DEPOSIT_GAS;
  if (flags.approveWrap) gas += APPROVE_GAS;
  if (pay !== "usdc") {
    gas += (swapGas > 0n ? swapGas : SWAP_FALLBACK_GAS) + SWAP_OVERHEAD_GAS;
    if (flags.approveRouter) gas += APPROVE_GAS;
    if (flags.resetRouter) gas += USDT_RESET_GAS;
  }
  return gas;
}

/** Wei of gas priced in Chainlink 8-decimal USD. */
export function networkFeeUsd8(gas: bigint, maxFeePerGas: bigint, ethUsd8: bigint): bigint {
  if (gas <= 0n || maxFeePerGas <= 0n || ethUsd8 <= 0n) return 0n;
  return (gas * maxFeePerGas * ethUsd8) / 10n ** 18n;
}

/** USD per token (8 decimals) implied by spending `amountIn` to buy `usdcOut` USDC. */
export function executionUsd8(usdcOut: bigint, usdcUsd8: bigint, amountIn: bigint, amountInScale: number): bigint {
  if (usdcOut <= 0n || amountIn <= 0n || usdcUsd8 <= 0n) return 0n;
  const usd8 = (usdcOut * usdcUsd8) / 1_000_000n;
  return (usd8 * 10n ** BigInt(amountInScale)) / amountIn;
}

/** Positive when the pool execution is worse than the Chainlink mid, in basis points. */
export function priceImpactBps(midUsd8: bigint, executionUsd8Value: bigint): bigint {
  if (midUsd8 <= 0n || executionUsd8Value <= 0n) return 0n;
  return ((midUsd8 - executionUsd8Value) * 10_000n) / midUsd8;
}

export function formatImpact(bps: bigint): string {
  const negative = bps < 0n;
  const abs = negative ? -bps : bps;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${frac}%`;
}

export function shortHash(hash: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

export type DepositPreview = {
  pay: PayAsset;
  symbol: string;
  tokenName: string;
  typedUsd: string;
  receiveUsd: string;
  protocolFeeUsd: string;
  protocolFeePct: string;
  amountIn: string;
  amountInUsd: string;
  spendMax: string;
  rate: string;
  slippage: string;
  deadline: string;
  networkFeeUsd: string;
  networkFeeKnown: boolean;
  totalFeeUsd: string;
  totalFeeKnown: boolean;
  priceImpact: string;
  priceImpactSafe: boolean;
  priceImpactNote: string;
  wrappedUsdc: string;
};

export function buildDepositPreview(input: {
  pay: PayAsset;
  typedUsdMicros: bigint;
  credit: bigint;
  fee: bigint;
  underlying: bigint;
  amountIn: bigint;
  amountInMax: bigint;
  usdcUsd8: bigint;
  tokenUsd8: bigint;
  networkFeeUsd8: bigint | null;
}): DepositPreview {
  const meta = depositTokenMeta[input.pay];
  const scale = tokenScale(input.pay);
  const digits = input.pay === "eth" ? 6 : 2;
  const receiveUsd8 = (input.credit * input.usdcUsd8) / 10n ** 18n;
  const feeUsd8 = (input.fee * input.usdcUsd8) / 10n ** 18n;
  const amountUsd8 = (input.amountIn * input.tokenUsd8) / 10n ** BigInt(scale);
  const execution = executionUsd8(input.underlying, input.usdcUsd8, input.amountIn, scale);
  const swapped = input.pay !== "usdc";
  const impactKnown = !swapped || (input.amountIn > 0n && execution > 0n && input.tokenUsd8 > 0n);
  const rawBps = swapped && impactKnown ? priceImpactBps(input.tokenUsd8, execution) : 0n;
  const adverse = rawBps > 0n ? rawBps : 0n;
  const safe = impactKnown && adverse <= PRICE_IMPACT_SAFE_BPS;
  const impact = impactKnown ? formatImpact(adverse) : "Unavailable";
  let priceImpactNote = "The pool price is unavailable.";
  if (!swapped) priceImpactNote = "No swap, so the price impact is 0.00%.";
  else if (impactKnown && safe) priceImpactNote = `Price impact is ${impact} and within the safe range.`;
  else if (impactKnown) priceImpactNote = `Price impact is ${impact}, above the 1% safe range.`;
  const networkKnown = input.networkFeeUsd8 !== null;
  const totalKnown = networkKnown;
  const total = networkKnown ? feeUsd8 + (input.networkFeeUsd8 ?? 0n) : 0n;
  const boughtUsd8 = (input.underlying * input.usdcUsd8) / 1_000_000n;
  const perToken =
    input.pay === "usdc" || input.amountIn <= 0n ? input.usdcUsd8 : (boughtUsd8 * 10n ** BigInt(scale)) / input.amountIn;
  return {
    pay: input.pay,
    symbol: meta.symbol,
    tokenName: meta.name,
    typedUsd: formatUsd8(input.typedUsdMicros * 100n),
    receiveUsd: formatUsd8(receiveUsd8),
    protocolFeeUsd: formatUsd8(feeUsd8),
    protocolFeePct: `${(PROTOCOL_FEE_BPS / 100).toFixed(1)}%`,
    amountIn: `${formatAmount(input.amountIn, scale, digits)} ${meta.symbol}`,
    amountInUsd: formatUsd8(amountUsd8),
    spendMax: `${formatAmount(input.amountInMax, scale, digits)} ${meta.symbol}`,
    rate: `1 ${input.pay === "usdc" ? "USDC" : meta.symbol} = $${formatPrice8(perToken)}`,
    slippage: swapped ? `${(SLIPPAGE_BPS / 100).toFixed(1)}%` : "No swap",
    deadline: `${QUOTE_DEADLINE_SECONDS / 60} minutes`,
    networkFeeUsd: networkKnown ? formatUsd8(input.networkFeeUsd8 ?? 0n) : "",
    networkFeeKnown: networkKnown,
    totalFeeUsd: totalKnown ? formatUsd8(total) : "",
    totalFeeKnown: totalKnown,
    priceImpact: impact,
    priceImpactSafe: safe,
    priceImpactNote,
    wrappedUsdc: formatAmount(input.underlying, 6, 2),
  };
}
