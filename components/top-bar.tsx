"use client";

import Link from "next/link";
import { AccountMark } from "@/components/account-mark";
import { IconBack } from "@/components/icons";

/** One top bar for every screen. A nested screen passes `back`. A tab root does not. The profile stays on the right. `desk` adds the wide header and hides this bar from `lg` up. */
export function TopBar({ title, back, action, desk = true }: { title: string; back?: string; action?: React.ReactNode; desk?: boolean }) {
  return (
    <>
      <header className="sticky top-0 z-20 -mx-4 mb-4 flex min-h-14 items-center gap-2 border-b border-border bg-background px-3 pt-[env(safe-area-inset-top)] lg:hidden">
        {back ? (
          <Link href={back} aria-label="Back" className="grid size-10 shrink-0 place-items-center rounded-full text-foreground">
            <IconBack className="size-5" />
          </Link>
        ) : null}
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight">{title}</h1>
        {action ? <div className="shrink-0">{action}</div> : null}
        <AccountMark />
      </header>
      {desk ? (
        <header className="mb-6 hidden items-end justify-between gap-4 lg:flex">
          <div className="min-w-0">
            {back ? (
              <Link href={back} className="mb-2 inline-flex min-h-11 items-center gap-1 rounded-full px-1 text-sm font-medium text-[#5C6572] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]">
                <IconBack className="size-4" />
                Back
              </Link>
            ) : null}
            {title ? <h1 className="truncate font-[family-name:var(--font-manrope)] text-[1.75rem] leading-none font-semibold tracking-[-0.03em] text-[#141414]">{title}</h1> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {action ? <div className="shrink-0">{action}</div> : null}
            <AccountMark />
          </div>
        </header>
      ) : null}
    </>
  );
}
