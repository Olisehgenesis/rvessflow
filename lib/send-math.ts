import { parseUnits } from "viem";

export const sendAssets = [
  "eth",
  "usdc",
  "usdt",
  "usdcx",
  "ethx",
  "base-usdm",
  "base-eth",
  "base-usdc",
  "base-usdt",
  "base-usdcx",
  "base-ethx",
  "celo",
  "celo-usdc",
  "celo-usdt",
  "celo-usdm",
  "celo-mountain",
  "celo-cusdx",
  "celo-celox",
] as const;
export type SendAsset = (typeof sendAssets)[number];

export type SendChoice = {
  asset: SendAsset;
  label: string;
  network: string;
  balance: string;
  max: string;
  reserve: boolean;
};

/** Kept in the wallet so an ETH transfer can still pay its network fee. */
export const ethReserve = 20_000_000_000_000n;

/** Kept when USDC has to pay the network fee, so the fee can be taken first. */
export const usdcFeeReserve = 500_000n;

export type MoveAsset = "eth" | "usdc";

export type MoveChoice = {
  asset: MoveAsset;
  label: string;
  balance: string;
  max: string;
  maxWei: string;
  decimals: number;
  note: string;
};

export function isSendAsset(value: string): value is SendAsset {
  return (sendAssets as readonly string[]).includes(value);
}

const sixDecimal = new Set<SendAsset>(["usdc", "usdt", "base-usdc", "base-usdt", "celo-usdc", "celo-usdt"]);
const nativeUnits = new Set<SendAsset>(["eth", "ethx", "base-eth", "base-ethx", "celo", "celo-celox"]);

export function sendDecimals(asset: SendAsset): number {
  return sixDecimal.has(asset) ? 6 : 18;
}

export function parseSendAmount(asset: SendAsset, value: string): bigint {
  const clean = value.replace(/,/g, "").trim();
  const decimals = sendDecimals(asset);
  if (!new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`).test(clean) || Number(clean) <= 0) {
    throw new Error("Enter an amount greater than zero.");
  }
  return parseUnits(clean, decimals);
}

export function spendableEth(balance: bigint): bigint {
  return balance > ethReserve ? balance - ethReserve : 0n;
}

/** Full USDC balance when ETH can pay the fee. Otherwise a little USDC stays behind. */
export function spendableUsdc(balance: bigint, ethPays: boolean): bigint {
  if (ethPays) return balance;
  return balance > usdcFeeReserve ? balance - usdcFeeReserve : 0n;
}

/** `step` 0 is nothing. `step` at `steps` is the exact maximum, with no rounding short of it. */
export function portion(max: bigint, step: number, steps = 1000): bigint {
  if (step <= 0 || max <= 0n || steps <= 0) return 0n;
  if (step >= steps) return max;
  return (max * BigInt(Math.floor(step))) / BigInt(steps);
}

/** Activity stores dollar tokens at 18 decimals and ETH at 18 decimals. */
export function activityUnits(asset: SendAsset, amount: bigint): { amount: string; asset: "usdcx" | "ethx" } {
  if (nativeUnits.has(asset)) return { amount: amount.toString(), asset: "ethx" };
  if (sixDecimal.has(asset)) return { amount: (amount * 10n ** 12n).toString(), asset: "usdcx" };
  return { amount: amount.toString(), asset: "usdcx" };
}
