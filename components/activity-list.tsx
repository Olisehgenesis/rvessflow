"use client";

import Link from "next/link";
import { IconDown, IconLock, IconPlay } from "@/components/icons";
import { activityWhen } from "@/components/ui-bits";
import { show } from "@/lib/display";
import type { Quote } from "@/lib/quote";

export type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  direction: "in" | "out";
  amount: string;
  asset: "usdcx" | "ethx";
  at: number;
  href: string;
};

export function ActivityList({ items, quote }: { items: ActivityItem[]; quote: Quote }) {
  if (items.length === 0) {
    return <p className="rounded-2xl border border-border bg-card px-4 py-5 text-sm text-muted-foreground">Nothing is moving yet. Save, stream, or lock to start.</p>;
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {items.map((item) => (
        <li key={item.id}>
          <Link href={item.href} className="flex items-center gap-3 px-4 py-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-foreground">
              {item.title === "Locked" || item.title === "Unlocked" || item.title === "Unlocked early" ? (
                <IconLock className="size-4" />
              ) : item.direction === "out" ? (
                <IconPlay className="size-4" />
              ) : (
                <IconDown className="size-4" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{item.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
              <time className="block text-xs text-muted-foreground" dateTime={new Date(item.at * 1000).toISOString()}>
                {activityWhen(item.at)}
              </time>
            </span>
            <span className="shrink-0 text-sm font-medium tabular-nums">
              {item.direction === "out" ? "−" : "+"} {item.asset === "ethx" ? `${trimEth(item.amount)} ETH` : `${quote.unit} ${show(item.amount, quote)}`}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function trimEth(amount: string) {
  try {
    const value = Number(BigInt(amount)) / 1e18;
    return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
  } catch {
    return amount;
  }
}
