"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconDown, IconHome, IconLock, IconMark, IconMore, IconPeople, IconPlay, IconSeed } from "@/components/icons";

const left = [
  { href: "/home", label: "Home", icon: IconHome },
  { href: "/goals", label: "Goals", icon: IconSeed },
];

const right = [
  { href: "/groups", label: "Groups", icon: IconPeople },
  { href: "/settings", label: "More", icon: IconMore },
];

const creates = [
  { href: "/home/add", label: "Add money", body: "USDC, USDT, ETH, card, or mobile money.", icon: IconDown },
  { href: "/goals/new", label: "Create a goal", body: "Save toward something.", icon: IconSeed },
  { href: "/goals/new?kind=flow", label: "Start a stream", body: "Send or receive on a schedule.", icon: IconPlay },
  { href: "/vaults/new", label: "Create a lock", body: "Keep funds until a date.", icon: IconLock },
  { href: "/groups/new", label: "Start a group", body: "Save with other people.", icon: IconPeople },
  { href: "/vaults", label: "Your vaults", body: "Locks already on Base.", icon: IconLock },
];

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[minmax(0,1fr)_30rem]">
      <aside className="relative hidden bg-background text-foreground lg:flex lg:flex-col lg:p-12">
        <p className="flex items-center gap-2 text-sm font-medium">
          <IconMark className="size-8" />
          RvessFlow
          <span className="rounded-full bg-[#D6F34A] px-2 py-0.5 text-[11px] font-semibold tracking-normal text-[#141414]">Beta</span>
        </p>
        <p className="mt-4 max-w-sm text-lg">A hold stays still. A stream moves every second.</p>
      </aside>
      <div className="relative mx-auto flex h-dvh w-full max-w-lg flex-col bg-background lg:h-dvh lg:border-l lg:border-border">
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        <Suspense fallback={<div className="sticky bottom-0 h-14 border-t border-border bg-card" />}>
          <BottomNav />
        </Suspense>
      </div>
    </div>
  );
}

function hidesNav(pathname: string) {
  return /^\/home\/add\/(token|review|status|receive|mobile|card)/.test(pathname);
}

function BottomNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (hidesNav(pathname)) return null;
  return (
    <>
      {open ? <button type="button" aria-label="Close create menu" className="fixed inset-0 z-20 cursor-default" onClick={() => setOpen(false)} /> : null}
    <nav className="relative z-30 shrink-0 border-t border-border bg-card px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {open ? (
        <div className="absolute right-3 bottom-full left-3 mb-3 overflow-hidden rounded-2xl border border-border bg-white shadow-[0_16px_40px_-24px_rgba(0,0,0,0.45)]">
          {creates.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 border-b border-border px-3.5 py-3 last:border-b-0"
              >
                <span className="grid size-9 place-items-center rounded-full bg-[#F4F8EE] text-[#141414]">
                  <Icon className="size-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className="block text-xs text-muted-foreground">{item.body}</span>
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}
      <ul className="grid grid-cols-5 items-end">
        {left.map((item) => (
          <NavItem key={item.href} item={item} pathname={pathname} />
        ))}
        <li className="flex justify-center">
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? "Close create menu" : "Create"}
            onClick={() => setOpen((value) => !value)}
            className="-mt-6 grid size-12 place-items-center rounded-full bg-[#D6F34A] text-[#141414] shadow-[0_8px_20px_-10px_rgba(20,20,20,0.55)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            <span className={`text-2xl leading-none font-medium ${open ? "rotate-45" : ""}`}>+</span>
          </button>
        </li>
        {right.map((item) => (
          <NavItem key={item.href} item={item} pathname={pathname} />
        ))}
      </ul>
    </nav>
    </>
  );
}

function NavItem({ item, pathname }: { item: { href: string; label: string; icon: typeof IconHome }; pathname: string }) {
  const active = pathname === item.href || (item.href !== "/settings" && pathname.startsWith(`${item.href}/`)) || (item.href === "/settings" && pathname.startsWith("/settings"));
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        className={`flex min-h-11 flex-col items-center justify-center gap-0.5 py-1 text-[11px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${active ? "font-semibold text-foreground" : "text-muted-foreground"}`}
      >
        <span className={active ? "grid size-8 place-items-center rounded-full bg-[#D6F34A]" : "grid size-8 place-items-center"}>
          <Icon className="size-5" />
        </span>
        <span>{item.label}</span>
      </Link>
    </li>
  );
}
