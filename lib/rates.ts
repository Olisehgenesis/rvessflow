import "server-only";

import { cache } from "react";
import { currencyCode } from "@/lib/session";
import { chainQuote, currencyByCode, type Quote } from "@/lib/quote";

const TABLES = [
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json",
  "https://latest.currency-api.pages.dev/v1/currencies/usd.min.json",
];

const PEG = "https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=usd";

export async function loadQuoteFor(code: string): Promise<Quote> {
  const choice = currencyByCode(code);
  if (choice.code === "fusdcx") return chainQuote();
  try {
    const [peg, table] = await Promise.all([usdcUsd(), usdTable()]);
    const perUsd = table.rates[choice.code];
    if (!perUsd || !Number.isFinite(perUsd)) return chainQuote();
    const perToken = peg.usd * perUsd;
    const digits = choice.code === "jpy" || choice.code === "ugx" ? 0 : 2;
    const local = perToken.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    const pegText = `USDC is ${peg.usd.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} USD on CoinGecko`;
    const country = choice.code === "usd" ? pegText : `${pegText}. 1 USD ≈ ${local} ${choice.label} at the ${table.date} rate`;
    return { code: choice.code, unit: choice.label, perToken, digits, note: `${country}.` };
  } catch {
    return { ...chainQuote(), note: "Country rates did not load, so amounts stay in USD." };
  }
}

export const loadQuote = cache(async (): Promise<Quote> => loadQuoteFor(await currencyCode()));

async function usdcUsd(): Promise<{ usd: number }> {
  const response = await fetch(PEG, { headers: { accept: "application/json" }, next: { revalidate: 3600 } });
  if (!response.ok) return { usd: 1 };
  const body = (await response.json()) as { "usd-coin"?: { usd?: number } };
  const usd = body["usd-coin"]?.usd;
  return { usd: typeof usd === "number" && usd > 0 ? usd : 1 };
}

async function usdTable(): Promise<{ date: string; rates: Record<string, number> }> {
  let last = "The currency API did not respond.";
  for (const url of TABLES) {
    try {
      const response = await fetch(url, { next: { revalidate: 3600 } });
      if (!response.ok) {
        last = `The currency API returned ${response.status}.`;
        continue;
      }
      const body = (await response.json()) as { date?: string; usd?: Record<string, number> };
      if (!body.usd) continue;
      return { date: body.date ?? "today", rates: body.usd };
    } catch (error) {
      last = error instanceof Error ? error.message : last;
    }
  }
  throw new Error(last);
}
