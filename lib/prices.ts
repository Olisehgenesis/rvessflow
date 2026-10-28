import "server-only";

import { parseAbi, type Address } from "viem";
import { baseMarket } from "@/lib/base-market";
import { chain, publicClient } from "@/lib/protocol";

const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
]);

export type Prices = {
  ethUsd8: bigint;
  usdcUsd8: bigint;
  usdtUsd8: bigint;
  updatedAt: number;
};

const ttlMs = 60_000;
const maxAgeSeconds = 24 * 60 * 60;
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

export async function coinMap(ids: string[]): Promise<Record<string, bigint>> {
  const prices: Record<string, bigint> = {};
  for (const id of ids) prices[id] = 0n;
  try {
    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.map(encodeURIComponent).join(",")}&vs_currencies=usd`, {
      next: { revalidate: 60 },
    });
    if (!response.ok) return prices;
    const body = (await response.json()) as Record<string, { usd?: number }>;
    for (const id of ids) {
      const usd = body[id]?.usd;
      if (typeof usd === "number" && usd > 0) prices[id] = BigInt(Math.round(usd * 1e8));
    }
  } catch {
    return prices;
  }
  return prices;
}

export async function coinUsd8(id: string): Promise<bigint> {
  const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd`, {
    next: { revalidate: 60 },
  });
  if (!response.ok) throw new Error("The price is not available.");
  const body = (await response.json()) as Record<string, { usd?: number }>;
  const usd = body[id]?.usd;
  if (typeof usd !== "number" || !(usd > 0)) throw new Error("The price is not available.");
  return BigInt(Math.round(usd * 1e8));
}

async function ethFallback(): Promise<bigint> {
  return coinUsd8("ethereum");
}

export async function loadPrices(): Promise<Prices> {
  if (cache && Date.now() - cache.at < ttlMs) return cache.prices;
  const now = Math.floor(Date.now() / 1000);
  if (chain.id === 84532 || chain.id === 42220) {
    let ethUsd8 = 0n;
    try {
      ethUsd8 = chain.id === 42220 ? await coinUsd8("celo") : await ethFallback();
    } catch {
      ethUsd8 = 0n;
    }
    const prices: Prices = { ethUsd8, usdcUsd8: 100_000_000n, usdtUsd8: 100_000_000n, updatedAt: now };
    cache = { at: Date.now(), prices };
    return prices;
  }
  const fresh = (updatedAt: number) => updatedAt > 0 && now - updatedAt < maxAgeSeconds;
  try {
    const [eth, usdc, usdt] = await Promise.all([
      readFeed(baseMarket.chainlink.ethUsd),
      readFeed(baseMarket.chainlink.usdcUsd),
      readFeed(baseMarket.chainlink.usdtUsd),
    ]);
    const prices: Prices = {
      ethUsd8: fresh(eth.updatedAt) ? eth.usd8 : await ethFallback(),
      usdcUsd8: fresh(usdc.updatedAt) ? usdc.usd8 : 100_000_000n,
      usdtUsd8: fresh(usdt.updatedAt) ? usdt.usd8 : 100_000_000n,
      updatedAt: Math.min(eth.updatedAt, usdc.updatedAt, usdt.updatedAt),
    };
    cache = { at: Date.now(), prices };
    return prices;
  } catch (error) {
    if (cache) return cache.prices;
    throw error instanceof Error ? error : new Error("Prices are not available.");
  }
}
