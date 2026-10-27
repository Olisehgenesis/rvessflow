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

/**
 * Subtitle for a token row. Money already committed to an open outgoing stream
 * is not spendable, so it must not read like the loose USDC or ETH balance.
 */
export function holdingCaption(network: string, spendable: bigint, streaming: bigint): string {
  if (streaming <= 0n) return network;
  if (spendable <= 0n) return "Streaming out";
  return `${network} · streaming out`;
}

export function hasTokenAmount(amount: string): boolean {
  const value = Number(amount.replace(/,/g, ""));
  return Number.isFinite(value) && value > 0;
}

/**
 * Short “get started” rows. A zero balance is not enough: someone with a goal,
 * lock, or group has already started, even if the wallet reads $0.00.
 */
export function showGettingStarted(input: { goals: number; locks: number; groups: number; amounts: string[] }): boolean {
  if (input.goals > 0 || input.locks > 0 || input.groups > 0) return false;
  return !input.amounts.some(hasTokenAmount);
}
