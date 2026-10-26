"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { IconChevron, IconEye, IconEyeOff } from "@/components/icons";
import { RetryButton } from "@/components/retry-button";
import { WithdrawSheet } from "@/components/withdraw-sheet";

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

export function HomeBalance({
  totalUsd,
  totalLocal,
  localUnit,
  available,
  streaming,
  locked,
  showWithdraw,
  idleUsd = "0.00",
}: {
  totalUsd: string;
  totalLocal?: string;
  localUnit?: string;
  available: string;
  streaming: string;
  locked: string;
  showWithdraw: boolean;
  idleUsd?: string;
}) {
  const conceal = useConceal();
  const usd = (value: string) => (conceal ? hidden : `$${value}`);
  const columns = [
    { label: "Available", usd: available },
    { label: "Streaming", usd: streaming },
    { label: "Locked", usd: locked },
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
      <p className="mt-2 font-display text-4xl font-semibold tracking-tight tabular-nums">{usd(totalUsd)}</p>
      {totalLocal && localUnit ? (
        <p className="mt-0.5 text-sm text-[#3C4A2E] tabular-nums">{conceal ? hidden : `${localUnit} ${totalLocal}`}</p>
      ) : null}
      <dl className="mt-4 grid grid-cols-3">
        {columns.map((column, index) => (
          <div key={column.label} className={index === 0 ? "pr-2" : "border-l border-[#141414]/10 px-3"}>
            <dt className="text-xs text-[#3C4A2E]">{column.label}</dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums">{usd(column.usd)}</dd>
          </div>
        ))}
      </dl>
      <div className={`mt-4 grid gap-2 ${showWithdraw ? "grid-cols-2" : "grid-cols-1"}`}>
        <Link href="/home/add" className={lime}>
          Top up
        </Link>
        {showWithdraw ? <WithdrawSheet idleUsd={idleUsd} /> : null}
      </div>
    </section>
  );
}
