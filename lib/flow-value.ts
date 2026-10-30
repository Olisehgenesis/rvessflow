import { assetKind } from "@/lib/assets";

export type FlowPrices = {
  usdcUsd8: bigint;
  ethUsd8: bigint;
  gdxUsd8: bigint;
};

/** Super-token wei → 18-decimal USD wei, using that token's USD price. */
export function tokenUsdWei(amount: bigint, token: string, prices: FlowPrices): bigint {
  if (amount <= 0n) return 0n;
  const kind = assetKind(token);
  const price = kind === "gdx" ? prices.gdxUsd8 : kind === "ethx" ? prices.ethUsd8 : prices.usdcUsd8;
  if (price <= 0n) return 0n;
  return (amount * price) / 100_000_000n;
}

export function flowPricesFrom(input: { usdcUsd8: string | bigint; ethUsd8: string | bigint; gdxUsd8: string | bigint }): FlowPrices {
  return {
    usdcUsd8: BigInt(input.usdcUsd8),
    ethUsd8: BigInt(input.ethUsd8),
    gdxUsd8: BigInt(input.gdxUsd8),
  };
}

export function sumTokenUsd(
  rows: readonly { token: string; rate?: string; remaining?: string }[],
  prices: FlowPrices,
  field: "rate" | "remaining",
): bigint {
  return rows.reduce((sum, row) => sum + tokenUsdWei(BigInt(row[field] || "0"), row.token, prices), 0n);
}
