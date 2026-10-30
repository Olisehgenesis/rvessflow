"use client";

import { useState } from "react";
import Link from "next/link";
import { IconChevron } from "@/components/icons";
import { PrivateLine, PrivateUsd } from "@/components/private-money";
import { TokenIcon } from "@/components/token-icon";
import { TokenSheet } from "@/components/token-sheet";
import { hasTokenAmount, sortHoldingsByBalance } from "@/lib/home-math";
import type { HoldingRow } from "@/lib/holding-row";
import type { GdxTradeBalances } from "@/lib/token-face";

export function AssetList({
  rows,
  localUnit,
  desk = false,
  hideEmpty = false,
  trade,
}: {
  rows: HoldingRow[];
  localUnit?: string;
  desk?: boolean;
  hideEmpty?: boolean;
  trade?: GdxTradeBalances;
}) {
  const [all, setAll] = useState(false);
  const [picked, setPicked] = useState<HoldingRow | null>(null);
  const ranked = sortHoldingsByBalance(rows);
  const funded = ranked.filter((row) => hasTokenAmount(row.amount) || hasTokenAmount(row.usd) || hasTokenAmount(row.local ?? ""));
  const shown = hideEmpty && !all ? funded : ranked;
  const hidden = hideEmpty ? rows.length - funded.length : 0;
  const listClass = desk
    ? "divide-y divide-[#EEF1E6] overflow-hidden rounded-3xl border border-[#E6EADF] bg-white shadow-[0_1px_0_rgba(20,20,20,0.04)]"
    : "divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card";
  const rowClass = desk
    ? "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[#F7FAF2] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#141414]"
    : "flex w-full items-center gap-3 px-3.5 py-3 text-left";
  return (
    <div>
      <ul className={listClass}>
        {shown.map((row) => (
          <li key={row.key} id={desk ? undefined : row.key}>
            {row.parts ? (
              <Link href={`/home/assets/${row.key}`} className={rowClass}>
                <TokenIcon symbol={row.label} network={row.network} />
                <AssetAmounts row={row} localUnit={localUnit} named={false} />
                <IconChevron className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ) : (
              <button type="button" className={rowClass} onClick={() => setPicked(row)} aria-label={row.label}>
                <TokenIcon symbol={row.label} network={row.network} />
                <AssetAmounts row={row} localUnit={localUnit} named={false} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {hideEmpty && hidden > 0 ? (
        <button type="button" onClick={() => setAll((current) => !current)} className="mt-3 w-full text-center text-sm font-medium">
          {all ? "Hide empty" : `View all (${hidden} with no balance)`}
        </button>
      ) : null}
      {picked ? (
        <TokenSheet
          row={picked}
          open
          onOpen={(open) => {
            if (!open) setPicked(null);
          }}
          localUnit={localUnit}
          trade={trade}
        />
      ) : null}
    </div>
  );
}

function AssetAmounts({ row, localUnit, named }: { row: HoldingRow; localUnit?: string; named: boolean }) {
  return (
    <span className="min-w-0 flex-1">
      {named ? (
        <>
          <span className="block text-sm font-semibold">{row.label}</span>
          <span className="block text-xs text-muted-foreground">{row.network}</span>
        </>
      ) : (
        <span className="block text-xs text-muted-foreground">{row.network}</span>
      )}
      <span className="mt-0.5 block text-sm font-semibold">
        {row.local && localUnit ? <PrivateLine value={`${localUnit} ${row.local}`} /> : <PrivateUsd value={row.usd} />}
      </span>
      <span className="block text-[11px] text-muted-foreground">
        <PrivateLine value={row.amount} />
      </span>
    </span>
  );
}
