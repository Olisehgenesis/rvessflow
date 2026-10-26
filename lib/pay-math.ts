import { PROTOCOL_FEE_BPS, SLIPPAGE_BPS, SUPER_UNIT } from "@/lib/base-market";

export type PayAsset = "usdc" | "usdt" | "eth" | "usdcx";
export type ReceiveAsset = "usdc" | "usdt" | "eth";

export function readPay(value: string): PayAsset {
  if (value === "usdc" || value === "usdt" || value === "eth" || value === "usdcx") return value;
  throw new Error("Pick USDC, USDT, ETH, or the savings token.");
}

export function readReceive(value: string): ReceiveAsset {
  if (value === "usdt" || value === "eth" || value === "usdc") return value;
  throw new Error("Pick USDC, USDT, or ETH.");
}

export function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("Cannot divide by zero.");
  return (numerator + denominator - 1n) / denominator;
}

export function protocolFeeOf(amount: bigint): bigint {
  if (amount <= 0n) return 0n;
  return (amount * BigInt(PROTOCOL_FEE_BPS)) / 10_000n;
}

/** Super tokens that must be minted so a 0.30% skim still leaves at least `net`. */
export function grossForNet(net: bigint): bigint {
  if (net <= 0n) return 0n;
  const kept = 10_000n - BigInt(PROTOCOL_FEE_BPS);
  let gross = ceilDiv(net * 10_000n, kept);
  if (gross - protocolFeeOf(gross) < net) gross += 1n;
  return gross;
}

export function superFromUnderlying(underlying: bigint): bigint {
  return underlying * SUPER_UNIT;
}

export function underlyingForSuper(superAmount: bigint): bigint {
  if (superAmount <= 0n) return 0n;
  return ceilDiv(superAmount, SUPER_UNIT);
}

/**
 * USDC (6 decimals) the vault must pull so depositUnderlying credits at least `net`
 * super tokens after the 0.30% skim.
 */
export function fundForNet(net: bigint): { underlying: bigint; minted: bigint; fee: bigint; credit: bigint } {
  if (net <= 0n) return { underlying: 0n, minted: 0n, fee: 0n, credit: 0n };
  let underlying = underlyingForSuper(grossForNet(net));
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const minted = superFromUnderlying(underlying);
    const fee = protocolFeeOf(minted);
    const credit = minted - fee;
    if (credit >= net) return { underlying, minted, fee, credit };
    underlying += 1n;
  }
  throw new Error("Could not size that deposit.");
}

/** Whole super tokens a wallet wrap must mint. No skim: the protocol fee is pulled later. */
export function wrapForSuper(superAmount: bigint): { underlying: bigint; minted: bigint } {
  const underlying = underlyingForSuper(superAmount);
  return { underlying, minted: superFromUnderlying(underlying) };
}

export function slippageCeiling(amount: bigint, bps = SLIPPAGE_BPS): bigint {
  if (amount <= 0n) return 0n;
  return ceilDiv(amount * BigInt(10_000 + bps), 10_000n);
}

export function slippageFloor(amount: bigint, bps = SLIPPAGE_BPS): bigint {
  if (amount <= 0n) return 0n;
  return (amount * BigInt(10_000 - bps)) / 10_000n;
}

/** USD typed by a person, to 6-decimal micro-dollars. At most two decimal places. */
export function parseUsd(value: string): bigint {
  const clean = value.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) throw new Error("Enter the amount in USD.");
  const [whole, frac = ""] = clean.split(".");
  const micros = BigInt(whole) * 1_000_000n + BigInt((frac + "000000").slice(0, 6));
  if (micros <= 0n) throw new Error("Enter an amount greater than zero.");
  return micros;
}

/**
 * Super tokens equal to `usdMicros` of value at a Chainlink USDC/USD price (8 decimals).
 * 1 USDCx tracks 1 USDC, so a price above or below $1 changes how many tokens $1 buys.
 */
export function netSuperForUsd(usdMicros: bigint, usdcUsd8: bigint): bigint {
  if (usdcUsd8 <= 0n) throw new Error("The USDC price is not available.");
  const usdc = ceilDiv(usdMicros * 100_000_000n, usdcUsd8);
  return usdc * SUPER_UNIT;
}

export function formatGrouped(value: bigint): string {
  const text = value.toString();
  return text.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** `scale` is the number of decimals in `amount`. `digits` is how many to show. */
export function formatAmount(amount: bigint, scale: number, digits: number): string {
  const negative = amount < 0n;
  const value = negative ? -amount : amount;
  const base = 10n ** BigInt(scale);
  const whole = value / base;
  const frac = value % base;
  const shown = frac.toString().padStart(scale, "0").slice(0, digits).replace(/0+$/, "");
  const body = shown ? `${formatGrouped(whole)}.${shown}` : formatGrouped(whole);
  return negative ? `-${body}` : body;
}

/** Chainlink-style 8-decimal price, shown with up to four decimals so $0.9997 does not look like $0.99. */
export function formatPrice8(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const scaled = abs / 10_000n;
  const whole = scaled / 10_000n;
  const fracFull = (scaled % 10_000n).toString().padStart(4, "0");
  const trimmed = fracFull.replace(/0+$/, "");
  const frac = trimmed.length < 2 ? fracFull.slice(0, 2) : trimmed;
  return `${negative ? "-" : ""}${formatGrouped(whole)}.${frac}`;
}

export function formatUsd8(value: bigint): string {
  const negative = value < 0n;
  const cents = (negative ? -value : value) / 1_000_000n;
  const whole = cents / 100n;
  const frac = (cents % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${formatGrouped(whole)}.${frac}`;
}
