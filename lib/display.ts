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

/** A fiat or local unit, rather than the on-chain dollar or a 1:1 USD view. */
export function showsLocal(quote: Quote): boolean {
  return quote.code !== "usd" && quote.code !== "fusdcx" && quote.perToken > 0;
}

/** A USD figure such as `12.50` or `1,250.50`, written in the selected currency. No symbol. */
export function localFromUsd(usd: string, quote: Quote): string {
  const clean = usd.replace(/,/g, "").trim();
  if (!showsLocal(quote)) return clean;
  const amount = Number(clean);
  if (!Number.isFinite(amount)) return clean;
  const local = amount * quote.perToken;
  if (quote.digits <= 0) return String(Math.round(local));
  return local.toFixed(Math.min(quote.digits, 2));
}

/** What the person typed in their currency, back to a 2-decimal USD string for the chain. */
export function usdFromLocal(typed: string, quote: Quote): string {
  const clean = typed.replace(/,/g, "").trim();
  if (!showsLocal(quote)) return clean;
  if (!/^\d+(\.\d+)?$/.test(clean)) return clean;
  const usd = Number(clean) / quote.perToken;
  if (!Number.isFinite(usd) || usd <= 0) return clean;
  return usd.toFixed(2);
}

/** `$12.50`, or `UGX 46,250` when a local currency is selected. */
export function priced(usd: string, quote: Quote): string {
  const clean = usd.replace(/,/g, "").trim().replace(/^\$/, "");
  if (!showsLocal(quote)) return clean ? `$${clean}` : "$0.00";
  const plain = localFromUsd(clean, quote);
  const amount = Number(plain);
  const shown = Number.isFinite(amount)
    ? amount.toLocaleString("en-US", {
        minimumFractionDigits: quote.digits > 0 ? Math.min(quote.digits, 2) : 0,
        maximumFractionDigits: quote.digits,
      })
    : plain;
  return `${quote.unit} ${shown}`;
}

/** Rewrites `$12.50` inside a sentence. Token amounts without a dollar sign stay as they are. */
export function localizeDollars(value: string, quote: Quote): string {
  if (!showsLocal(quote)) return value;
  return value.replace(/\$(\d[\d,]*(?:\.\d+)?)/g, (_match, num: string) => priced(num, quote));
}

export function asTokenAmount(typed: string, quote: Quote): string {
  const clean = typed.replace(/,/g, "").trim();
  if (quote.code === "fusdcx" || !(quote.perToken > 0)) return clean;
  if (!/^\d+(\.\d+)?$/.test(clean)) return clean;
  const tokens = Number(clean) / quote.perToken;
  if (!Number.isFinite(tokens) || tokens <= 0) return clean;
  return tokens.toFixed(8).replace(/\.?0+$/, "");
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
  if (quote.digits <= 0) return 0;
  const step = Number(formatUnits(perSecondWei, 18)) * quote.perToken;
  if (step >= 0.01) return Math.max(quote.digits, 2);
  if (step >= 0.0001) return 4;
  return 6;
}

/** Dollar subtitle. Sub-cent streams stay visible (`$0.002`); larger amounts use cents. */
export function usdCaption(wei: string | bigint): string {
  const n = Number(formatUnits(typeof wei === "bigint" ? wei : BigInt(wei || "0"), 18));
  if (!Number.isFinite(n)) return "$0.00";
  const abs = Math.abs(n);
  const text = abs > 0 && abs < 0.01
    ? abs.toLocaleString("en-US", { maximumFractionDigits: 4 })
    : abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "-" : ""}$${text}`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** A name the person chose. Blank, "Wallet", "Passkey", and a shortened address do not count. */
export function chosenName(value: string | null | undefined): string | null {
  const name = value?.trim().slice(0, 32) ?? "";
  if (!name) return null;
  const lower = name.toLowerCase();
  if (lower === "wallet" || lower === "passkey") return null;
  if (/^0x[a-f0-9]{4}…[a-f0-9]{4}$/i.test(name)) return null;
  return name;
}

/**
 * Keeps a display name unique. The first person keeps the name.
 * The next ones get a number on the end: Ada, Ada 2, Ada 3.
 */
export function assignNameCode(wanted: string, taken: readonly string[]): string {
  const clean = wanted.trim().replace(/\s+/g, " ").slice(0, 32);
  const used = new Set(taken.map((item) => item.trim().toLowerCase()).filter(Boolean));
  if (!used.has(clean.toLowerCase())) return clean;
  const stem = clean.replace(/ \d+$/, "").slice(0, 28).trim();
  for (let code = 2; code < 1000; code += 1) {
    const next = `${stem} ${code}`;
    if (!used.has(next.toLowerCase())) return next;
  }
  return clean;
}

export function percent(part: string, whole: string): number {
  const total = BigInt(whole || "0");
  if (total <= 0n) return 0;
  const value = (BigInt(part || "0") * 100n) / total;
  return Number(value > 100n ? 100n : value);
}
