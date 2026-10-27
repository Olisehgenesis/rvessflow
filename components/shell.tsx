"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreateMenu } from "@/components/create-menu";

const left = [
  { href: "/home", label: "Home", src: "/nav/home.png" },
  { href: "/goals", label: "Save", src: "/nav/goals.png" },
];

const right = [
  { href: "/groups", label: "Groups", src: "/nav/groups.png" },
  { href: "/settings", label: "Settings", src: "/nav/more.png" },
];

const desk = [
  { href: "/home", label: "Home", src: "/nav/home.png", match: (path: string) => path === "/home" || path.startsWith("/home/") },
  { href: "/goals", label: "Save", src: "/nav/goals.png", match: (path: string) => path.startsWith("/goals") && !path.startsWith("/goals/flow") && !path.startsWith("/goals/expense") },
  { href: "/goals/flow", label: "Stream", src: "/marks/flow.png", match: (path: string) => path.startsWith("/goals/flow") || path.startsWith("/goals/expense") },
  { href: "/vaults", label: "Lock", src: "/marks/lock.png", match: (path: string) => path.startsWith("/vaults") },
  { href: "/groups", label: "Groups", src: "/nav/groups.png", match: (path: string) => path.startsWith("/groups") },
];

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rvess-desk min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:bg-[#F3F6EE]">
      <DesktopSide />
      <div className="relative mx-auto flex h-dvh w-full max-w-lg flex-col bg-background lg:mx-0 lg:h-dvh lg:max-w-none lg:bg-transparent">
        <div id="desk-main" className="min-h-0 flex-1 overflow-y-auto lg:px-8 lg:py-7 xl:px-10">{children}</div>
        <div className="lg:hidden">
          <Suspense fallback={<div className="sticky bottom-0 h-14 border-t border-border bg-card" />}>
            <BottomNav />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function DesktopSide() {
  const pathname = usePathname();
  return (
    <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-[#E3EAD4] lg:bg-[#F7FAF2] lg:px-3 lg:py-5">
      <Link href="/home" className="flex items-center gap-2.5 rounded-2xl px-2 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]">
        <img src="/mark.jpg" alt="" className="size-9 rounded-xl object-cover" />
        <span className="font-[family-name:var(--font-manrope)] text-lg font-semibold tracking-[-0.03em] text-[#141414]">RvessFlow</span>
      </Link>
      <nav className="mt-7" aria-label="Main">
        <ul className="space-y-1">
          {desk.map((item) => {
            const active = item.match(pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] ${active ? "bg-[#E7F4C4] font-semibold text-[#141414]" : "text-[#3A3F47] hover:bg-white"}`}
                >
                  <img src={item.src} alt="" className="size-6 object-contain" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <Link
        href="/settings"
        aria-current={pathname.startsWith("/settings") ? "page" : undefined}
        className={`mt-auto flex min-h-11 items-center gap-3 rounded-2xl border-t border-transparent px-3 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] ${pathname.startsWith("/settings") ? "bg-[#E7F4C4] font-semibold text-[#141414]" : "text-[#3A3F47] hover:bg-white"}`}
      >
        <img src="/nav/more.png" alt="" className="size-6 object-contain" />
        Account
      </Link>
    </aside>
  );
}

function hidesNav(pathname: string) {
  return /^\/home\/add\/(token|review|status|receive|mobile|card)/.test(pathname);
}

function BottomNav() {
  const pathname = usePathname();
  if (hidesNav(pathname)) return null;
  return (
    <nav className="z-20 shrink-0 bg-card px-2 pt-1 pb-[max(0.45rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(20,27,45,0.05)]">
      <ul className="grid grid-cols-5 items-end">
        {left.map((item) => (
          <NavTab key={item.href} item={item} pathname={pathname} />
        ))}
        <li className="flex flex-col items-center justify-end">
          <CreateMenu />
          <span className="pb-1 text-[11px] text-muted-foreground">Create</span>
        </li>
        {right.map((item) => (
          <NavTab key={item.href} item={item} pathname={pathname} />
        ))}
      </ul>
    </nav>
  );
}

function NavTab({
  item,
  pathname,
}: {
  item: { href: string; label: string; src: string };
  pathname: string;
}) {
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <li>
      <Link
        href={item.href}
        className={`flex min-h-12 flex-col items-center justify-end gap-1 pb-1 text-[11px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${active ? "font-semibold text-foreground" : "text-muted-foreground"}`}
      >
        <span className={`grid h-8 place-items-center rounded-full px-3 ${active ? "bg-[#D4F06B]" : ""}`}>
          <img src={item.src} alt="" className="size-7 object-contain" />
        </span>
        {item.label}
      </Link>
    </li>
  );
}
