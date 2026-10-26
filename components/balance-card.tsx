"use client";

import { useSyncExternalStore } from "react";
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

export function useConceal() {
  return useSyncExternalStore(subscribeConceal, readConceal, () => false);
}

export function toggleConceal() {
  writeConceal(!readConceal());
}

export function BalanceCard({
  totalUsd,
  totalLocal,
  localUnit,
  available,
  streaming,
  locked,
}: {
  totalUsd: string;
  totalLocal?: string;
  localUnit?: string;
  available: string;
  streaming: string;
  locked: string;
}) {
  const conceal = useConceal();
  const usd = (value: string) => (conceal ? hidden : `$${value}`);
  const local = (value?: string) => (conceal || !value || !localUnit ? "" : `≈ ${localUnit} ${value}`);
  return (
    <section className="relative mt-5 overflow-hidden rounded-[1.6rem] bg-[#E7F8C8] p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[#3d4a32]">Total balance</p>
        <button
          type="button"
          aria-label={conceal ? "Show balance" : "Hide balance"}
          aria-pressed={conceal}
          onClick={() => writeConceal(!conceal)}
          className="grid size-8 place-items-center text-[#3d4a32]"
        >
          {conceal ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
        </button>
      </div>
      <p className="mt-1 font-display text-[2.4rem] font-semibold leading-none tracking-tight tabular-nums">{usd(totalUsd)}</p>
      {totalLocal && localUnit ? <p className="mt-1.5 text-sm text-[#5c6b4e] tabular-nums">{local(totalLocal)}</p> : null}
      <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-[#5c6b4e]">Available</dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums">{usd(available)}</dd>
        </div>
        <div>
          <dt className="text-[#5c6b4e]">Streaming</dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums">{usd(streaming)}</dd>
        </div>
        <div>
          <dt className="text-[#5c6b4e]">Locked</dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums">{usd(locked)}</dd>
        </div>
      </dl>
    </section>
  );
}
