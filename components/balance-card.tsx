"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { IconChevron, IconEye, IconEyeOff, IconSun } from "@/components/icons";

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

export function HomeBalance({
  totalUsd,
  totalUsdc,
  totalLocal,
  localUnit,
  available,
  availableUsdc,
  streaming,
  streamingUsdc,
  locked,
  lockedUsdc,
}: {
  totalUsd: string;
  totalUsdc: string;
  totalLocal?: string;
  localUnit?: string;
  available: string;
  availableUsdc: string;
  streaming: string;
  streamingUsdc: string;
  locked: string;
  lockedUsdc: string;
}) {
  const conceal = useConceal();
  const usd = (value: string) => (conceal ? hidden : `$${value}`);
  const usdc = (value: string) => (conceal ? hidden : value);
  const columns = [
    { label: "Available", usd: available, usdc: availableUsdc },
    { label: "Streaming", usd: streaming, usdc: streamingUsdc },
    { label: "Locked", usd: locked, usdc: lockedUsdc },
  ];
  return (
    <section className="relative mt-5 overflow-hidden rounded-3xl bg-[#D4F06B] p-4 text-[#172114] shadow-[0_12px_30px_rgba(20,27,45,0.06)]">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Total balance</p>
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
      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-display text-4xl font-semibold tracking-tight tabular-nums">
            {usd(totalUsd)}
            <IconSun className="size-5 shrink-0 text-[#E2A93B]" />
          </p>
          <p className="mt-1 text-sm font-medium text-[#3C4A2E] tabular-nums">≈ {usdc(totalUsdc)} USDC</p>
          {totalLocal && localUnit ? (
            <p className="mt-0.5 text-sm text-[#3C4A2E] tabular-nums">{conceal ? hidden : `${localUnit} ${totalLocal}`}</p>
          ) : null}
        </div>
        <img src="/home/wallet.webp" alt="" className="mt-1 w-24 shrink-0" />
      </div>
      <dl className="relative z-10 mt-4 grid grid-cols-3">
        {columns.map((column, index) => (
          <div key={column.label} className={index === 0 ? "pr-2" : "border-l border-[#172114]/15 px-2"}>
            <dt className="text-xs">{column.label}</dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums">{usd(column.usd)}</dd>
            <p className="text-[11px] text-[#3C4A2E] tabular-nums">≈ {usdc(column.usdc)} USDC</p>
          </div>
        ))}
      </dl>
    </section>
  );
}
