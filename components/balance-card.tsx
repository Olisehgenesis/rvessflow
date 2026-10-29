"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { RollingText, useFlowClock } from "@/components/flowing";
import { IconChevron, IconEye, IconEyeOff } from "@/components/icons";
import { RetryButton } from "@/components/retry-button";
import { show, streamDigits } from "@/lib/display";
import { homeBalancePlaces, liveHomeColumns } from "@/lib/home-math";
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

export function BalanceError({ message }: { message: string }) {
  return (
    <section className="mt-5 rounded-3xl border border-border bg-card p-4" role="alert">
      <p className="text-sm font-semibold">Balance unavailable</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{message}</p>
      <p className="mt-2 text-sm text-muted-foreground">Nothing here is shown as $0.00 until the network answers.</p>
      <RetryButton />
    </section>
  );
}

export type BalancePulse = {
  readAt: number;
  inWeiPerSec: string;
  inCapWei: string;
  outWeiPerSec: string;
  streamWeiPerSec: string;
  streamRemainingWei: string;
  totalUsd8: string;
  availableUsd8: string;
  streamingUsd8: string;
  lockedUsd8: string;
  usdcUsd8: string;
  quote: Quote;
};

export function HomeBalance({
  totalLocal,
  localUnit,
  showWithdraw,
  savings = [],
  unit = "USD",
  network = "Base",
  pulse,
  quote,
  usdcUsd8 = "0",
  availableUsd8 = "0",
  streamingUsd8 = "0",
  lockedUsd8 = "0",
  layout = "phone",
}: {
  totalUsd: string;
  totalLocal?: string;
  localUnit?: string;
  available: string;
  streaming: string;
  locked: string;
  showWithdraw: boolean;
  savings?: SavingBox[];
  unit?: string;
  network?: string;
  pulse?: BalancePulse;
  quote?: Quote;
  usdcUsd8?: string;
  availableUsd8?: string;
  streamingUsd8?: string;
  lockedUsd8?: string;
  layout?: "phone" | "desk";
}) {
  const conceal = useConceal();
  const now = useFlowClock(pulse?.readAt ?? 0);
  const ticking = Boolean(pulse && (BigInt(pulse.inWeiPerSec) > 0n || BigInt(pulse.streamWeiPerSec) > 0n));
  const live = ticking && pulse
    ? liveHomeColumns({
        elapsedMs: BigInt(Math.max(0, Math.floor((now - pulse.readAt) * 1000))),
        availableUsd8: BigInt(pulse.availableUsd8),
        streamingUsd8: BigInt(pulse.streamingUsd8),
        lockedUsd8: BigInt(pulse.lockedUsd8),
        usdcUsd8: BigInt(pulse.usdcUsd8),
        inWeiPerSec: BigInt(pulse.inWeiPerSec),
        inCapWei: BigInt(pulse.inCapWei),
        outWeiPerSec: BigInt(pulse.outWeiPerSec),
        streamWeiPerSec: BigInt(pulse.streamWeiPerSec),
        streamRemainingWei: BigInt(pulse.streamRemainingWei),
      })
    : {
        available: BigInt(availableUsd8),
        streaming: BigInt(streamingUsd8),
        locked: BigInt(lockedUsd8),
        total: BigInt(availableUsd8) + BigInt(streamingUsd8) + BigInt(lockedUsd8),
      };
  const netWei = pulse ? BigInt(pulse.inWeiPerSec) - BigInt(pulse.outWeiPerSec) : 0n;
  const netDigits = pulse ? streamDigits(netWei < 0n ? -netWei : netWei, pulse.quote) : homeBalancePlaces;
  const pace = pulse && netWei !== 0n ? `${netWei < 0n ? "−" : "+"}${show(netWei < 0n ? -netWei : netWei, pulse.quote, netDigits)} ${pulse.quote.unit} each second` : "";
  const places = homeBalancePlaces;
  const shownTotal = formatUsdPlaces(live.total, places);
  const shownAvailable = formatUsdPlaces(live.available, places);
  const shownStreaming = formatUsdPlaces(live.streaming, places);
  const shownLocked = formatUsdPlaces(live.locked, places);
  const price = BigInt(pulse?.usdcUsd8 ?? usdcUsd8);
  const localQuote = pulse?.quote ?? quote;
  const preferLocal = Boolean(localUnit && localQuote);
  const shownLocal = preferLocal && localQuote ? formatLocal(live.total, localQuote, price, places) : totalLocal;
  const availableLocal = preferLocal && localQuote ? formatLocal(live.available, localQuote, price, places) : "";
  const streamingLocal = preferLocal && localQuote ? formatLocal(live.streaming, localQuote, price, places) : "";
  const lockedLocal = preferLocal && localQuote ? formatLocal(live.locked, localQuote, price, places) : "";
  const figure = (prefix: string, value: string, live: boolean) => {
    const lead = prefix === "$" ? "$" : `${prefix} `;
    if (conceal) return hidden;
    return live ? (
      <>
        {lead}
        <RollingText text={value} />
      </>
    ) : (
      `${lead}${value}`
    );
  };
  const desk = layout === "desk";
  const columns = preferLocal
    ? [
        { label: "Available", prefix: localUnit ?? "", value: availableLocal, live: ticking, usd: shownAvailable, usdLive: ticking },
        { label: "Streaming", prefix: localUnit ?? "", value: streamingLocal, live: ticking, usd: shownStreaming, usdLive: ticking },
        { label: "Locked", prefix: localUnit ?? "", value: lockedLocal, live: false, usd: shownLocked, usdLive: false },
      ]
    : [
        { label: "Available", prefix: "$", value: shownAvailable, live: ticking, usd: "", usdLive: false },
        { label: "Streaming", prefix: "$", value: shownStreaming, live: ticking, usd: "", usdLive: false },
        { label: "Locked", prefix: "$", value: shownLocked, live: false, usd: "", usdLive: false },
      ];
  const actions = (
    <div className={`mt-4 grid gap-2 ${showWithdraw ? "grid-cols-2" : "grid-cols-1"}`}>
      <TopUpSheet network={network} className={lime} />
      {showWithdraw ? <WithdrawSheet savings={savings} unit={unit} conceal={conceal} /> : null}
    </div>
  );
  if (desk) {
    return (
      <section className="relative overflow-hidden rounded-[1.75rem] border border-[#D7E7B0] bg-[#E7F4C4] p-6 text-[#141414] xl:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center">
              <p className="text-sm">Total balance</p>
              <button
                type="button"
                aria-label={conceal ? "Show balance" : "Hide balance"}
                aria-pressed={conceal}
                onClick={() => writeConceal(!conceal)}
                className="grid size-11 place-items-center rounded-full hover:bg-[#141414]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
              >
                {conceal ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
              </button>
            </div>
            <p className="mt-1 whitespace-nowrap font-[family-name:var(--font-manrope)] text-5xl font-semibold tracking-[-0.04em] tabular-nums">
              {preferLocal ? figure(localUnit ?? "", shownLocal ?? "", ticking) : figure("$", shownTotal, ticking)}
            </p>
            {preferLocal ? <p className="mt-0.5 whitespace-nowrap text-sm text-[#3C4A2E] tabular-nums">{figure("$", shownTotal, ticking)}</p> : null}
            {ticking && pace ? <p className="mt-1 text-xs font-medium text-[#3C4A2E] tabular-nums">{pace}</p> : null}
          </div>
          <img src="/marks/saving.png" alt="" className="pointer-events-none hidden w-28 shrink-0 xl:block" />
        </div>
        <dl className="mt-6 grid grid-cols-3 border-t border-[#141414]/10 pt-4">
          {columns.map((column, index) => (
            <div key={column.label} className={index === 0 ? "pr-2" : "border-l border-[#141414]/10 px-3"}>
              <dt className="text-xs text-[#3C4A2E]">{column.label}</dt>
              <dd className="mt-1 text-base font-semibold whitespace-nowrap tabular-nums">
                {figure(column.prefix, column.value, column.live)}
                {preferLocal && column.usd ? <span className="mt-0.5 block text-[11px] font-medium text-[#3C4A2E]">{figure("$", column.usd, column.usdLive)}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
        <div className={`mt-6 grid max-w-sm gap-2 ${showWithdraw ? "grid-cols-2" : "grid-cols-1"}`}>
          <TopUpSheet network={network} className={lime} />
          {showWithdraw ? <WithdrawSheet savings={savings} unit={unit} conceal={conceal} /> : null}
        </div>
      </section>
    );
  }
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
      <p className="mt-2 whitespace-nowrap font-display text-4xl font-semibold tracking-tight tabular-nums">
        {preferLocal ? figure(localUnit ?? "", shownLocal ?? "", ticking) : figure("$", shownTotal, ticking)}
      </p>
      {preferLocal ? (
        <p className="mt-0.5 whitespace-nowrap text-sm text-[#3C4A2E] tabular-nums">{figure("$", shownTotal, ticking)}</p>
      ) : null}
      {ticking && pace ? <p className="mt-1 text-xs font-medium text-[#3C4A2E] tabular-nums">{pace}</p> : null}
      <dl className="mt-4 grid grid-cols-3">
        {columns.map((column, index) => (
          <div key={column.label} className={index === 0 ? "pr-2" : "border-l border-[#141414]/10 px-3"}>
            <dt className="text-xs text-[#3C4A2E]">{column.label}</dt>
            <dd className="mt-1 text-sm font-semibold whitespace-nowrap tabular-nums">{figure(column.prefix, column.value, column.live)}</dd>
          </div>
        ))}
      </dl>
      {actions}
    </section>
  );
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
