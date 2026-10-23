import { formatUnits } from "viem";
import type { Quote } from "@/lib/quote";

export function money(value: string | bigint, digits = 2): string {
  const raw = formatUnits(typeof value === "bigint" ? value : BigInt(value), 18);
  const negative = raw.startsWith("-");
  const body = negative ? raw.slice(1) : raw;
  const [whole, frac = ""] = body.split(".");
  const n = Number(whole);
  if (!Number.isFinite(n)) return raw;
  if (n === 0) {
    const tiny = Number(`0.${frac || "0"}`);
    if (tiny === 0) return "0.00";
    return tiny.toLocaleString("en-US", { maximumFractionDigits: 4 });
  }
  const trimmed = (frac + "00").slice(0, digits);
  return `${negative ? "-" : ""}${n.toLocaleString("en-US")}.${trimmed}`;
}

export function flowingMoney(value: string | bigint): string {
  const raw = formatUnits(typeof value === "bigint" ? value : BigInt(value), 18);
  const negative = raw.startsWith("-");
  const body = negative ? raw.slice(1) : raw;
  const [whole, frac = ""] = body.split(".");
  const n = Number(whole);
  if (!Number.isFinite(n)) return raw;
  return `${negative ? "-" : ""}${n.toLocaleString("en-US")}.${(frac + "000000").slice(0, 6)}`;
}

export function show(value: string | bigint, quote: Quote, digits?: number): string {
  const places = digits ?? quote.digits;
  if (quote.code === "fusdcx") return places >= 6 ? flowingMoney(value) : money(value, places);
  const tokens = Number(formatUnits(typeof value === "bigint" ? value : BigInt(value), 18));
  const amount = tokens * quote.perToken;
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  });
}

export function labeled(value: string | bigint, quote: Quote, digits?: number): string {
  return `${show(value, quote, digits)} ${quote.unit}`;
}

export function streamDigits(perSecondWei: bigint, quote: Quote): number {
  if (quote.code === "fusdcx") return 6;
  const step = Number(formatUnits(perSecondWei, 18)) * quote.perToken;
  if (step >= 0.01) return Math.max(quote.digits, 2);
  if (step >= 0.0001) return 4;
  return 6;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function percent(part: string, whole: string): number {
  const total = BigInt(whole || "0");
  if (total <= 0n) return 0;
  const value = (BigInt(part || "0") * 100n) / total;
  return Number(value > 100n ? 100n : value);
}
