"use client";

import { useState } from "react";
import Link from "next/link";
import { IconChevron } from "@/components/icons";
import { PrivateLine, PrivateUsd } from "@/components/private-money";
import { TokenIcon } from "@/components/token-icon";
import { hasTokenAmount } from "@/lib/home-math";
import type { HoldingRow } from "@/lib/holding-row";
import { networkLabel } from "@/lib/network";

export function AssetList({
  rows,
  localUnit,
  desk = false,
  hideEmpty = false,
}: {
  rows: HoldingRow[];
  localUnit?: string;
  desk?: boolean;
  hideEmpty?: boolean;
}) {
  const [all, setAll] = useState(false);
  const funded = rows.filter((row) => hasTokenAmount(row.amount) || hasTokenAmount(row.usd));
  const shown = hideEmpty && !all ? funded : rows;
  const hidden = hideEmpty ? rows.length - funded.length : 0;
  const listClass = desk
    ? "divide-y divide-[#EEF1E6] overflow-hidden rounded-3xl border border-[#E6EADF] bg-white shadow-[0_1px_0_rgba(20,20,20,0.04)]"
    : "divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card";
  const rowClass = desk
    ? "flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[#F7FAF2] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#141414]"
    : "flex items-center gap-3 px-3.5 py-3";
  return (
    <div>
      <ul className={listClass}>
        {shown.map((row) => (
          <li key={row.key} id={desk ? undefined : row.key}>
            <Link href={assetHref(row)} className={rowClass}>
              <TokenIcon symbol={row.label} network={row.network} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{row.label}</span>
                <span className="block text-xs text-muted-foreground">{row.network}</span>
              </span>
              <span className="text-right">
                {row.local && localUnit ? (
                  <span className="block text-sm font-semibold">
                    <PrivateLine value={`${localUnit} ${row.local}`} />
                  </span>
                ) : (
                  <span className="block text-sm font-semibold">
                    <PrivateUsd value={row.usd} />
                  </span>
                )}
                {row.local && localUnit ? (
                  <span className="block text-xs text-muted-foreground">
                    <PrivateUsd value={row.usd} />
                  </span>
                ) : null}
                <span className="block text-[11px] text-muted-foreground">
                  <PrivateLine value={`${row.amount} ${row.label}`} />
                </span>
              </span>
              <IconChevron className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
      {hideEmpty && hidden > 0 ? (
        <button type="button" onClick={() => setAll((current) => !current)} className="mt-3 w-full text-center text-sm font-medium">
          {all ? "Hide empty" : `View all (${hidden} with no balance)`}
        </button>
      ) : null}
    </div>
  );
}

function assetHref(row: HoldingRow) {
  if (row.parts) return `/home/assets/${row.key}`;
  if (row.key === "usdcx" || row.key === "ethx") return "/vaults";
  const here = row.network === networkLabel() || row.network.startsWith(`${networkLabel()} `);
  if (!here) return "/home/add/receive";
  if (row.label === "USDC") return "/home/add/crypto?pay=usdc";
  if (row.label === "USDT") return "/home/add/crypto?pay=usdt";
  if (row.label === "ETH" || row.label === "CELO") return "/home/add/crypto?pay=eth";
  if (row.label === "G$" || row.key === "celo-gooddollar") return "/home/assets#swap";
  return "/home/add/receive";
}
