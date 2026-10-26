"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { RollingText, useFlowingValue } from "@/components/flowing";
import { IconChevron, IconEye, IconEyeOff } from "@/components/icons";
import { RetryButton } from "@/components/retry-button";
import { streamDigits } from "@/lib/display";
import type { Quote } from "@/lib/quote";
import { TopUpSheet, WithdrawSheet, type SavingBox } from "@/components/withdraw-sheet";

const hidden = "••••••";
const storageKey = "rvess-hide-balance";

let conceal = false;
let loaded = false;
const listeners = new Set<() => void>();

function readConceal() {
  if (!loaded && typeof window !== "undefined") {
    conceal = window.localStorage.getItem(storageKey) === "1";
    loaded = true;
  }
  return conceal;
}

function subscribeConceal(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function writeConceal(next: boolean) {
  conceal = next;
  loaded = true;
  window.localStorage.setItem(storageKey, next ? "1" : "0");
  listeners.forEach((listener) => listener());
}

export function useConceal() {
  return useSyncExternalStore(subscribeConceal, readConceal, () => false);
}

export function toggleConceal() {
  writeConceal(!readConceal());
}

const lime = "flex h-12 items-center justify-center rounded-full bg-[#D4F06B] text-sm font-semibold text-[#141414]";

export function BalanceSkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading balance" className="mt-5 rounded-3xl border border-border bg-[#E7F4C4] p-4">
      <p className="text-sm">Loading balance</p>
      <div className="mt-3 h-3 w-24 animate-pulse rounded-full bg-[#141414]/10" />
      <div className="mt-4 h-10 w-40 animate-pulse rounded-xl bg-[#141414]/10" />
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="h-8 animate-pulse rounded-lg bg-[#141414]/10" />
        <div className="h-8 animate-pulse rounded-lg bg-[#141414]/10" />
        <div className="h-8 animate-pulse rounded-lg bg-[#141414]/10" />
      </div>
    </section>
  );
}

export function BalanceError({ message, detail }: { message: string; detail?: string }) {
  return (
    <section className="mt-5 rounded-3xl border border-border bg-card p-4" role="alert">
      <p className="text-sm font-semibold">Balance unavailable</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{message}</p>
      <div className="mt-3">
        <RetryButton />
      </div>
      {detail && process.env.NODE_ENV === "development" ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">Technical detail</summary>
          <p className="mt-2 break-all text-xs text-muted-foreground">{detail}</p>
        </details>
      ) : null}
    </section>
  );
}

export type BalancePulse = {
  readAt: number;
  wallet: string;
  rate: string;
  ceiling: string;
  totalUsd8: string;
  availableUsd8: string;
  usdcUsd8: string;
  quote: Quote;
};

export function HomeBalance({
  totalUsd,
  totalLocal,
  localUnit,
  available,
  streaming,
  locked,
  showWithdraw,
  savings = [],
  wallet = [],
  idleUsd = "0.00",
  unit = "USD",
  network = "Base",
  pulse,
  quote,
  usdcUsd8 = "0",
  availableUsd8 = "0",
  streamingUsd8 = "0",
  lockedUsd8 = "0",
}: {
  totalUsd: string;
  totalLocal?: string;
  localUnit?: string;
  available: string;
  streaming: string;
  locked: string;
  showWithdraw: boolean;
  savings?: SavingBox[];
  wallet?: { label: string; amount: string; href: string }[];
  idleUsd?: string;
  unit?: string;
  network?: string;
  pulse?: BalancePulse;
  quote?: Quote;
  usdcUsd8?: string;
  availableUsd8?: string;
  streamingUsd8?: string;
  lockedUsd8?: string;
}) {
  const conceal = useConceal();
  const liveWei = useFlowingValue(pulse?.readAt ?? 0, pulse?.wallet ?? "0", pulse?.rate ?? "0", pulse?.wallet ?? "0", pulse?.ceiling);
  const ticking = Boolean(pulse && BigInt(pulse.rate) > 0n);
  let shownTotal = totalUsd;
  let shownLocal = totalLocal;
  let shownAvailable = available;
  let availableNowUsd8 = availableUsd8;
  if (ticking && pulse) {
    const livePrice = BigInt(pulse.usdcUsd8);
    const delta = liveWei - BigInt(pulse.wallet);
    const deltaUsd8 = livePrice > 0n ? (delta * livePrice) / 10n ** 18n : 0n;
    const totalNow = BigInt(pulse.totalUsd8) + deltaUsd8;
    const availableNow = BigInt(pulse.availableUsd8) + deltaUsd8;
    const usdPlaces = dollarPlaces(BigInt(pulse.rate));
    shownTotal = formatUsdPlaces(totalNow, usdPlaces);
    availableNowUsd8 = (availableNow < 0n ? 0n : availableNow).toString();
    shownAvailable = formatUsdPlaces(BigInt(availableNowUsd8), usdPlaces);
    const local = formatLocal(totalNow, pulse.quote, livePrice, streamDigits(BigInt(pulse.rate), pulse.quote));
    if (local) shownLocal = local;
  }
  const price = BigInt(pulse?.usdcUsd8 ?? usdcUsd8);
  const localQuote = pulse?.quote ?? quote;
  const preferLocal = Boolean(localUnit && shownLocal && localQuote);
  const localPlaces = ticking && localQuote ? streamDigits(BigInt(pulse?.rate ?? "0"), localQuote) : (localQuote?.digits ?? 0);
  const availableLocal = preferLocal && localQuote ? formatLocal(BigInt(availableNowUsd8), localQuote, price, ticking ? localPlaces : localQuote.digits) : "";
  const streamingLocal = preferLocal && localQuote ? formatLocal(BigInt(streamingUsd8), localQuote, price, localQuote.digits) : "";
  const lockedLocal = preferLocal && localQuote ? formatLocal(BigInt(lockedUsd8), localQuote, price, localQuote.digits) : "";
  const figure = (prefix: string, value: string, live: boolean) => {
    const lead = prefix === "$" ? "$" : `${prefix} `;
    if (conceal) return hidden;
    if (!value) return "Price unavailable";
    if (value.startsWith("<")) {
      const amount = value.slice(1);
      return prefix === "$" ? `< $${amount}` : `< ${prefix} ${amount}`;
    }
    return live ? (
      <>
        {lead}
        <RollingText text={value} />
      </>
    ) : (
      `${lead}${value}`
    );
  };
  const columns = preferLocal
    ? [
        { label: "Available", prefix: localUnit ?? "", value: availableLocal, live: ticking },
        { label: "Streaming", prefix: localUnit ?? "", value: streamingLocal, live: false },
        { label: "Locked", prefix: localUnit ?? "", value: lockedLocal, live: false },
      ]
    : [
        { label: "Available", prefix: "$", value: shownAvailable, live: ticking },
        { label: "Streaming", prefix: "$", value: streaming, live: false },
        { label: "Locked", prefix: "$", value: locked, live: false },
      ];
  return (
    <section className="mt-5 rounded-3xl border border-[#D7E7B0] bg-[#E7F4C4] p-4 text-[#141414]">
      <div className="flex items-center justify-between">
        <p className="text-sm">Total balance</p>
        <div className="flex items-center">
          <button
            type="button"
            aria-label={conceal ? "Show balance" : "Hide balance"}
            aria-pressed={conceal}
            onClick={() => writeConceal(!conceal)}
            className="grid size-8 place-items-center"
          >
            {conceal ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
          </button>
          <Link href="/home/assets" aria-label="Balance details" className="grid size-8 place-items-center">
            <IconChevron className="size-4" />
          </Link>
        </div>
      </div>
      <p className="mt-2 font-display text-4xl font-semibold tracking-tight tabular-nums">
        {preferLocal ? figure(localUnit ?? "", shownLocal ?? "", ticking) : figure("$", shownTotal, ticking)}
      </p>
      {preferLocal ? (
        <p className="mt-0.5 text-sm text-[#3C4A2E] tabular-nums">{figure("$", shownTotal, ticking)}</p>
      ) : null}
      <dl className="mt-4 grid grid-cols-3">
        {columns.map((column, index) => (
          <div key={column.label} className={index === 0 ? "pr-2" : "border-l border-[#141414]/10 px-3"}>
            <dt className="text-xs text-[#3C4A2E]">{column.label}</dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums">{figure(column.prefix, column.value, column.live)}</dd>
          </div>
        ))}
      </dl>
      <div className={`mt-4 grid gap-2 ${showWithdraw ? "grid-cols-2" : "grid-cols-1"}`}>
        <TopUpSheet network={network} className={lime} />
        {showWithdraw ? <WithdrawSheet savings={savings} unit={unit} conceal={conceal} idleUsd={idleUsd} wallet={wallet} /> : null}
      </div>
    </section>
  );
}

function dollarPlaces(rateWei: bigint): number {
  const step = Number(rateWei) / 1e18;
  if (!Number.isFinite(step) || step >= 0.01) return 2;
  if (step >= 0.0001) return 4;
  return 6;
}

function formatUsdPlaces(usd8: bigint, places: number): string {
  const negative = usd8 < 0n;
  const abs = negative ? -usd8 : usd8;
  const scale = 100_000_000n;
  const whole = abs / scale;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (places <= 0) return `${negative ? "-" : ""}${grouped}`;
  const frac = ((abs % scale) * 10n ** BigInt(places)) / scale;
  return `${negative ? "-" : ""}${grouped}.${frac.toString().padStart(places, "0")}`;
}

function formatLocal(usd8: bigint, quote: Quote, usdcUsd8: bigint, places: number): string {
  if (quote.code === "usd" || quote.code === "fusdcx" || !(quote.perToken > 0) || usdcUsd8 <= 0n) return "";
  const per = BigInt(Math.round(quote.perToken * 1_000_000));
  if (per <= 0n) return "";
  const scale = 10n ** BigInt(Math.max(places, 0));
  const den = usdcUsd8 * 1_000_000n;
  const scaled = (usd8 * per * scale + den / 2n) / den;
  const whole = scaled / scale;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (places <= 0) return grouped;
  const frac = (scaled % scale).toString().padStart(places, "0");
  return `${grouped}.${frac}`;
}
