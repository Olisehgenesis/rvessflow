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

export function BalanceCard({
  unit,
  total,
  available,
  streaming,
  locked,
}: {
  unit: string;
  total: string;
  available: string;
  streaming: string;
  locked: string;
}) {
  const conceal = useSyncExternalStore(subscribeConceal, readConceal, () => false);
  const text = (value: string) => (conceal ? hidden : `${unit} ${value}`);
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
      <p className="mt-1 font-display text-4xl font-semibold tracking-tight tabular-nums">{text(total)}</p>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Available</dt>
          <dd className="mt-1 font-medium tabular-nums">{text(available)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Streaming</dt>
          <dd className="mt-1 font-medium tabular-nums">{text(streaming)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Locked</dt>
          <dd className="mt-1 font-medium tabular-nums">{text(locked)}</dd>
        </div>
      </dl>
      <Link href="/home/add" className="mt-4 flex h-12 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
        Add money
      </Link>
    </section>
  );
}
