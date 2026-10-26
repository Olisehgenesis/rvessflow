"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreateMenu } from "@/components/create-menu";
import { IconMark } from "@/components/icons";

const left = [
  { href: "/home", label: "Home", src: "/nav/home.png" },
  { href: "/goals", label: "Goals", src: "/nav/goals.png" },
];

const right = [
  { href: "/groups", label: "Groups", src: "/nav/groups.png" },
  { href: "/settings", label: "More", src: "/nav/more.png" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[minmax(0,1fr)_30rem]">
      <aside className="relative hidden bg-background text-foreground lg:flex lg:flex-col lg:p-12">
        <p className="flex items-center gap-2 text-sm font-medium">
          <IconMark className="size-8" />
          RvessFlow
          <span className="rounded-full bg-[#D4F06B] px-2 py-0.5 text-[11px] font-semibold tracking-normal text-[#141B2D]">Beta</span>
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
  if (hidesNav(pathname)) return null;
  return (
    <nav className="z-20 shrink-0 bg-card px-2 pt-1 pb-[max(0.45rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(20,27,45,0.05)]">
      <ul className="grid grid-cols-5 items-end">
        {left.map((item) => (
          <NavTab key={item.href} item={item} pathname={pathname} />
        ))}
        <li className="flex justify-center">
          <CreateMenu />
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
