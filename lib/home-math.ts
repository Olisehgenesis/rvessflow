import { formatUsd8 } from "@/lib/pay-math";

/** Split a portfolio's USD value so Available + Streaming + Locked equals the total. */
export function balanceColumns(totalUsd8: bigint, streamingUsd8: bigint, lockedUsd8: bigint) {
  const total = totalUsd8 > 0n ? totalUsd8 : 0n;
  let locked = lockedUsd8 > 0n ? lockedUsd8 : 0n;
  let streaming = streamingUsd8 > 0n ? streamingUsd8 : 0n;
  if (locked > total) locked = total;
  if (streaming > total - locked) streaming = total - locked;
  return { available: total - streaming - locked, streaming, locked };
}

/** USD value (8 decimals) expressed as USDC at the Chainlink USDC/USD price. */
export function usdcEquivalent(usd8: bigint, usdcUsd8: bigint): string {
  if (usd8 <= 0n || usdcUsd8 <= 0n) return "0.00";
  const cents = (usd8 * 100n + usdcUsd8 / 2n) / usdcUsd8;
  return formatUsd8(cents * 1_000_000n);
}

export function hasTokenAmount(amount: string): boolean {
  const value = Number(amount.replace(/,/g, ""));
  return Number.isFinite(value) && value > 0;
}

/** Empty welcome home: no goals, no locks, and no token balance. */
export function isWelcomeHome(input: { goals: number; locks: number; amounts: string[] }): boolean {
  if (input.goals > 0 || input.locks > 0) return false;
  return !input.amounts.some(hasTokenAmount);
}
