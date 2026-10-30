import type { HoldingRow } from "@/lib/holding-row";

export function sendAssetForKey(key: string): string | null {
  const map: Record<string, string> = {
    "base-usdc": "base-usdc",
    "base-usdt": "base-usdt",
    "base-usdm": "base-usdm",
    "base-usdcx": "base-usdcx",
    "base-eth": "base-eth",
    "base-ethx": "base-ethx",
    "celo-usdc": "celo-usdc",
    "celo-usdt": "celo-usdt",
    "celo-usdm": "celo-usdm",
    "celo-usdm-mountain": "celo-mountain",
    "celo-cusdx": "celo-cusdx",
    "celo-gooddollar": "celo-gdx",
    celo: "celo",
    "celo-celox": "celo-celox",
    usdc: "usdc",
    usdt: "usdt",
    eth: "eth",
    usdcx: "usdcx",
    ethx: "ethx",
  };
  return map[key] ?? null;
}

export function canSwapToken(row: HoldingRow) {
  return row.key === "celo-gooddollar" || Boolean(gdxViaFromRow(row));
}

export function gdxViaFromRow(row: HoldingRow) {
  if (row.key === "celo-gooddollar") return "usdm" as const;
  if (row.key === "celo-usdm") return "usdm" as const;
  if (row.key === "celo-usdc") return "usdc" as const;
  if (row.key === "celo-usdt") return "usdt" as const;
  if (row.key === "celo") return "celo" as const;
  return null;
}

export type GdxTradeBalances = {
  usdm: string;
  gdx: string;
  usdc: string;
  usdt: string;
  celo: string;
};
