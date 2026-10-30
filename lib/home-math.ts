import { formatUsd8 } from "@/lib/pay-math";

/** Home headline amounts: six places so a live stream ticks every second. */
export const homeBalancePlaces = 6;

function weiToUsd8(wei: bigint, usdcUsd8: bigint): bigint {
  if (wei <= 0n || usdcUsd8 <= 0n) return 0n;
  return (wei * usdcUsd8) / 10n ** 18n;
}

function movedWei(rate: bigint, elapsedMs: bigint, cap: bigint) {
  const gone = (rate * elapsedMs) / 1000n;
  return gone > cap ? cap : gone;
}

/**
 * Move Available / Streaming / Total with the clock.
 * Incoming and self-pay credit Available. Own streams debit Streaming.
 * The headline follows inbound the way the phone mock does: a flow you
 * receive (including to yourself) raises Total every tick; a stream to
 * someone else lowers it.
 */
export function liveHomeColumns(input: {
  elapsedMs: bigint;
  availableUsd8: bigint;
  streamingUsd8: bigint;
  lockedUsd8: bigint;
  usdcUsd8: bigint;
  inWeiPerSec: bigint;
  inCapWei: bigint;
  outWeiPerSec: bigint;
  streamWeiPerSec: bigint;
  streamRemainingWei: bigint;
}) {
  const elapsedMs = input.elapsedMs > 0n ? input.elapsedMs : 0n;
  const streamed = movedWei(input.streamWeiPerSec, elapsedMs, input.streamRemainingWei);
  const received = movedWei(input.inWeiPerSec, elapsedMs, input.inCapWei);
  const paidOut = movedWei(input.outWeiPerSec, elapsedMs, input.streamRemainingWei);
  const streaming = input.streamingUsd8 > 0n ? input.streamingUsd8 - weiToUsd8(streamed, input.usdcUsd8) : 0n;
  const available = input.availableUsd8 + weiToUsd8(received, input.usdcUsd8);
  const locked = input.lockedUsd8 > 0n ? input.lockedUsd8 : 0n;
  const start = input.availableUsd8 + input.streamingUsd8 + locked;
  const total = start + weiToUsd8(received, input.usdcUsd8) - weiToUsd8(paidOut, input.usdcUsd8);
  return {
    available: available > 0n ? available : 0n,
    streaming: streaming > 0n ? streaming : 0n,
    locked,
    total: total > 0n ? total : 0n,
  };
}

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

function moneyValue(amount: string | undefined): number {
  if (!amount) return 0;
  const value = Number(amount.replace(/,/g, ""));
  return Number.isFinite(value) ? value : 0;
}

/** Rank a holding so the largest wallet balance sits first. Prefer local, then USD, then token units. */
export function holdingRank(row: { amount: string; usd: string; local?: string }): number {
  const local = moneyValue(row.local);
  if (local > 0) return local;
  const usd = moneyValue(row.usd);
  if (usd > 0) return usd;
  return moneyValue(row.amount);
}

export function sortHoldingsByBalance<T extends { amount: string; usd: string; local?: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((left, right) => holdingRank(right) - holdingRank(left));
}

/**
 * Short “get started” rows. A zero balance is not enough: someone with a goal,
 * lock, or group has already started, even if the wallet reads $0.00.
 */
export function showGettingStarted(input: { goals: number; locks: number; groups: number; amounts: string[] }): boolean {
  if (input.goals > 0 || input.locks > 0 || input.groups > 0) return false;
  return !input.amounts.some(hasTokenAmount);
}
