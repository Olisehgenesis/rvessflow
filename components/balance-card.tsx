"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { IconEye, IconEyeOff } from "@/components/icons";

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

export type BalanceRow = {
  key: string;
  label: string;
  amount: string;
  usd: string;
  local?: string;
};

export function BalanceCard({
  totalUsd,
  totalLocal,
  localUnit,
  rows,
  available,
  streaming,
  locked,
}: {
  totalUsd: string;
  totalLocal?: string;
  localUnit?: string;
  rows: BalanceRow[];
  available: string;
  streaming: string;
  locked: string;
}) {
  const conceal = useSyncExternalStore(subscribeConceal, readConceal, () => false);
  const usd = (value: string) => (conceal ? hidden : `$${value}`);
  const local = (value?: string) => (conceal || !value || !localUnit ? "" : `${localUnit} ${value}`);
  return (
    <section className="mt-5 rounded-3xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Total balance</p>
        <button
          type="button"
          aria-label={conceal ? "Show balance" : "Hide balance"}
          aria-pressed={conceal}
          onClick={() => writeConceal(!conceal)}
          className="grid size-8 place-items-center text-muted-foreground"
        >
          {conceal ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
        </button>
      </div>
      <p className="mt-1 font-display text-4xl font-semibold tracking-tight tabular-nums">{usd(totalUsd)}</p>
      {totalLocal && localUnit ? <p className="mt-1 text-sm text-muted-foreground tabular-nums">{local(totalLocal)}</p> : null}
      <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Available</dt>
          <dd className="mt-1 font-medium tabular-nums">{usd(available)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Streaming</dt>
          <dd className="mt-1 font-medium tabular-nums">{usd(streaming)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Locked</dt>
          <dd className="mt-1 font-medium tabular-nums">{usd(locked)}</dd>
        </div>
      </dl>
      <ul className="mt-4 divide-y divide-border border-t border-border">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span>
              <span className="block font-medium">{row.label}</span>
              <span className="block text-xs text-muted-foreground tabular-nums">{conceal ? hidden : row.amount}</span>
            </span>
            <span className="text-right">
              <span className="block font-medium tabular-nums">{usd(row.usd)}</span>
              {row.local ? <span className="block text-xs text-muted-foreground tabular-nums">{local(row.local)}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <Link href="/home/add" className="mt-4 flex h-12 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
        Add money
      </Link>
    </section>
  );
}
