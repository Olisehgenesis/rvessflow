"use client";

import Link from "next/link";
import { useConceal } from "@/components/balance-card";
import { IconBolt, IconDown, IconLock, IconTarget } from "@/components/icons";
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

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function ActivityList({ items, quote }: { items: ActivityItem[]; quote: Quote }) {
  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-card px-4 py-5 text-sm text-muted-foreground">
        Nothing is moving yet. Save, stream, or lock to start.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const tone = activityTone(item.title);
        return (
          <li key={item.id}>
            <Link href={item.href} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3">
              <span className={`grid size-10 shrink-0 place-items-center rounded-full ${tone.well}`}>
                <tone.Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{item.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
                <time className="block text-xs text-muted-foreground" dateTime={new Date(item.at * 1000).toISOString()}>
                  {activityDate(item.at)}
                </time>
              </span>
              <ActivityAmount item={item} quote={quote} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ActivityAmount({ item, quote }: { item: ActivityItem; quote: Quote }) {
  const conceal = useConceal();
  const sign = item.direction === "out" ? "−" : "+";
  if (conceal) return <span className="shrink-0 text-sm font-semibold">••••</span>;
  const body = item.asset === "ethx" ? `${trimEth(item.amount)} ETH` : money(item.amount, quote);
  return (
    <span className={`shrink-0 text-sm font-semibold tabular-nums ${item.direction === "out" ? "text-foreground" : "text-[#2F7A32]"}`}>
      {sign}
      {body}
    </span>
  );
}

function money(amount: string, quote: Quote) {
  const shown = show(amount, quote);
  if (quote.code === "usd" || quote.code === "fusdcx") return `$${shown}`;
  return `${quote.unit} ${shown}`;
}

function activityDate(unix: number) {
  const date = new Date(unix * 1000);
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function activityTone(title: string): { well: string; Icon: typeof IconTarget } {
  if (title === "Locked" || title === "Unlocked" || title === "Unlocked early") {
    return { well: "bg-[#D4F06B] text-[#1C2A14]", Icon: IconLock };
  }
  if (title === "Streamed" || title === "Expense" || title === "Moved to wallet") {
    return { well: "bg-[#E4D9FF] text-[#6A4ED4]", Icon: IconBolt };
  }
  if (title === "Added money" || title === "Goal closed") {
    return { well: "bg-[#D4F06B] text-[#1C2A14]", Icon: IconDown };
  }
  return { well: "bg-[#D4F06B] text-[#1C2A14]", Icon: IconTarget };
}

function trimEth(amount: string) {
  try {
    const value = Number(BigInt(amount)) / 1e18;
    return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
  } catch {
    return amount;
  }
}
