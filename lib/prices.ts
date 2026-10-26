import "server-only";

import { connection } from "next/server";
import { parseAbi, type Address } from "viem";
import { baseMarket } from "@/lib/base-market";
import { chain, publicClient } from "@/lib/protocol";

const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
]);

export type Prices = {
  /** Null when no feed and no fallback returned a positive price. Never a stand-in zero. */
  ethUsd8: bigint | null;
  usdcUsd8: bigint | null;
  usdtUsd8: bigint | null;
  /** Assumptions the UI must show, including a $1 stable used without a live feed. */
  notes: string[];
  updatedAt: number;
};

const ttlMs = 60_000;
const maxAgeSeconds = 24 * 60 * 60;
const ONE_USD = 100_000_000n;
let cache: { at: number; prices: Prices } | null = null;

function scale(answer: bigint, decimals: number): bigint {
  if (decimals === 8) return answer;
  if (decimals < 8) return answer * 10n ** BigInt(8 - decimals);
  return answer / 10n ** BigInt(decimals - 8);
}

async function readFeed(address: Address): Promise<{ usd8: bigint; updatedAt: number }> {
  const [round, decimals] = await Promise.all([
    publicClient.readContract({ address, abi: feedAbi, functionName: "latestRoundData" }),
    publicClient.readContract({ address, abi: feedAbi, functionName: "decimals" }),
  ]);
  if (round[1] <= 0n) throw new Error("The price feed returned nothing.");
  return { usd8: scale(round[1], decimals), updatedAt: Number(round[3]) };
}

async function ethFallback(): Promise<bigint> {
  const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd", {
    next: { revalidate: 60 },
  });
  if (!response.ok) throw new Error("The ETH price is not available.");
  const body = (await response.json()) as { ethereum?: { usd?: number } };
  const usd = body.ethereum?.usd;
  if (typeof usd !== "number" || !(usd > 0)) throw new Error("The ETH price is not available.");
  return BigInt(Math.round(usd * 1e8));
}

export function requirePrice(value: bigint | null, name: string): bigint {
  if (value == null || value <= 0n) throw new Error(`${name} price is unavailable.`);
  return value;
}

async function ethOrNull(feed: { usd8: bigint; updatedAt: number } | null, fresh: (updatedAt: number) => boolean): Promise<bigint | null> {
  if (feed && fresh(feed.updatedAt) && feed.usd8 > 0n) return feed.usd8;
  try {
    return await ethFallback();
  } catch {
    return null;
  }
}

function assumedStable(feed: { usd8: bigint; updatedAt: number } | undefined, fresh: (updatedAt: number) => boolean): { usd8: bigint; assumed: boolean } {
  if (feed && fresh(feed.updatedAt) && feed.usd8 > 0n) return { usd8: feed.usd8, assumed: false };
  return { usd8: ONE_USD, assumed: true };
}

export async function loadPrices(): Promise<Prices> {
  await connection();
  const at = Date.now();
  if (cache && at - cache.at < ttlMs) return cache.prices;
  const now = Math.floor(at / 1000);
  const notes: string[] = [];
  if (chain.id === 84532) {
    let ethUsd8: bigint | null = null;
    try {
      ethUsd8 = await ethFallback();
    } catch {
      ethUsd8 = null;
    }
    if (ethUsd8 == null) notes.push("ETH price unavailable.");
    notes.push("USDC and USDT are shown at $1. This network has no stablecoin price feed.");
    const prices: Prices = { ethUsd8, usdcUsd8: ONE_USD, usdtUsd8: ONE_USD, notes, updatedAt: now };
    cache = { at, prices };
    return prices;
  }
  const fresh = (updatedAt: number) => updatedAt > 0 && now - updatedAt < maxAgeSeconds;
  try {
    const [eth, usdc, usdt] = await Promise.all([
      readFeed(baseMarket.chainlink.ethUsd).catch(() => null),
      readFeed(baseMarket.chainlink.usdcUsd).catch(() => undefined),
      readFeed(baseMarket.chainlink.usdtUsd).catch(() => undefined),
    ]);
    const ethUsd8 = await ethOrNull(eth, fresh);
    if (ethUsd8 == null) notes.push("ETH price unavailable.");
    const usdcPrice = assumedStable(usdc, fresh);
    const usdtPrice = assumedStable(usdt, fresh);
    if (usdcPrice.assumed || usdtPrice.assumed) {
      const which = [usdcPrice.assumed ? "USDC" : "", usdtPrice.assumed ? "USDT" : ""].filter(Boolean).join(" and ");
      notes.push(`${which} ${which.includes(" and ") ? "are" : "is"} shown at $1 because the price feed is missing or stale.`);
    }
    const prices: Prices = {
      ethUsd8,
      usdcUsd8: usdcPrice.usd8,
      usdtUsd8: usdtPrice.usd8,
      notes,
      updatedAt: now,
    };
    cache = { at, prices };
    return prices;
  } catch (error) {
    if (cache) return cache.prices;
    throw error instanceof Error ? error : new Error("Prices are not available.");
  }
}
