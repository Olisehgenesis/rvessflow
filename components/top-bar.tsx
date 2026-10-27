"use client";

import Link from "next/link";
import { AccountMark } from "@/components/account-mark";
import { IconBack } from "@/components/icons";

/** One top bar for every screen. A nested screen passes `back`. A tab root does not. The profile stays on the right. */
export function TopBar({ title, back, action }: { title: string; back?: string; action?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 -mx-4 mb-4 flex h-14 items-center gap-2 border-b border-border bg-background px-3">
      {back ? (
        <Link href={back} aria-label="Back" className="grid size-10 shrink-0 place-items-center rounded-full text-foreground">
          <IconBack className="size-5" />
        </Link>
      ) : null}
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight">{title}</h1>
      {action ? <div className="shrink-0">{action}</div> : null}
      <AccountMark />
    </header>
  );
}
