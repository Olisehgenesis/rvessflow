"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconHome, IconLock, IconMark, IconMore, IconPeople, IconSeed } from "@/components/icons";

const items = [
  { href: "/home", label: "Home", icon: IconHome },
  { href: "/goals", label: "Goals", icon: IconSeed },
  { href: "/vaults", label: "Vaults", icon: IconLock },
  { href: "/groups", label: "Groups", icon: IconPeople },
  { href: "/settings", label: "More", icon: IconMore },
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
  if (hidesNav(pathname)) return null;
  return (
    <nav className="z-20 shrink-0 border-t border-border bg-card px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex min-h-11 flex-col items-center justify-center gap-0.5 py-1 text-[11px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${active ? "font-semibold text-foreground" : "text-muted-foreground"}`}
              >
                <Icon className="size-5" />
                <span className={active ? "font-semibold" : ""}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
