# Layouts

Phone column (max-w-lg) with a charcoal desktop aside and a sticky bottom nav. Full source follows.

## `app/layout.tsx`

```tsx
import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RvessFlow",
  description: "Your money, in motion.",
  icons: { icon: "/mark.jpg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable} h-full antialiased`}>
      <body className="min-h-full bg-background font-sans text-foreground">{children}</body>
    </html>
  );
}
```

## `app/(main)/layout.tsx`

```tsx
import { Suspense } from "react";
import { Shell } from "@/components/shell";
import Loading from "./loading";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </Shell>
  );
}
```

## `components/shell.tsx`

```tsx
"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconHome, IconLock, IconMore, IconPeople, IconSeed } from "@/components/icons";

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
      <aside className="relative hidden bg-foreground text-background lg:flex lg:flex-col lg:justify-end lg:p-12">
        <p className="text-sm font-medium tracking-[0.16em] text-primary uppercase">RvessFlow</p>
        <p className="mt-4 font-display text-5xl leading-tight font-semibold">Your money, in motion.</p>
        <p className="mt-3 max-w-sm text-lg text-background/75">Your savings are moving toward your goals.</p>
      </aside>
      <div className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-background lg:border-l lg:border-border">
        <div className="flex-1">{children}</div>
        <Suspense fallback={<div className="sticky bottom-0 h-14 border-t border-border bg-card" />}>
          <BottomNav />
        </Suspense>
      </div>
    </div>
  );
}

function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky bottom-0 z-20 border-t border-border bg-card px-2 pt-1.5 pb-[max(0.4rem,env(safe-area-inset-bottom))]">
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[11px] ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
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
```

## `components/ui-bits.tsx`

```tsx
import Link from "next/link";
import { money, show } from "@/lib/display";
import type { Quote } from "@/lib/quote";

export function Page({ title, back, children, action }: { title: string; back?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <main className="px-5 pb-8 pt-5">
      <header className="mb-5 flex items-center gap-3">
        {back ? (
          <Link href={back} className="grid size-9 place-items-center rounded-full border border-border bg-card text-lg text-foreground" aria-label="Back">
            ←
          </Link>
        ) : null}
        <h1 className="flex-1 font-display text-xl font-semibold tracking-tight">{title}</h1>
        {action}
      </header>
      {children}
    </main>
  );
}

export function Amount({ value, unit, quote }: { value: string; unit?: string; quote?: Quote }) {
  return (
    <p className="flex items-baseline gap-2">
      <span className="font-display text-[2.6rem] font-semibold leading-none tracking-tight tabular-nums">{quote ? show(value, quote) : money(value)}</span>
      <span className="text-sm font-medium text-muted-foreground">{quote?.unit ?? unit ?? "fUSDCx"}</span>
    </p>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{money(value)}</p>
    </div>
  );
}

export function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-muted px-4 py-3 text-sm leading-relaxed text-foreground">{children}</p>;
}

export function ErrorNote({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>;
}

export function when(unix: number): string {
  if (!unix) return "Not started";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(unix * 1000);
}

export function durationLabel(seconds: number): string {
  if (seconds % (30 * 86400) === 0 && seconds >= 30 * 86400) {
    const months = seconds / (30 * 86400);
    return `${months} month${months === 1 ? "" : "s"}`;
  }
  if (seconds % 86400 === 0) {
    const days = seconds / 86400;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${seconds} seconds`;
}
```
