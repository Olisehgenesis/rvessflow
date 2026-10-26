import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import Loading from "../loading";
import { ActivityList } from "@/components/activity-list";
import { BalanceCard } from "@/components/balance-card";
import { Greeting } from "@/components/greeting";
import { IconDown, IconLock, IconMenu, IconPlay } from "@/components/icons";
import { loadActivity } from "@/lib/activity";
import { loadHoldings } from "@/lib/holdings";
import { loadQuote } from "@/lib/rates";
import { loadPortfolio } from "@/lib/protocol";
import { viewer } from "@/lib/session";

export default function HomePage() {
  return (
    <Suspense fallback={<Loading />}>
      <HomeBody />
    </Suspense>
  );
}

async function HomeBody() {
  const who = await viewer();
  const [data, quote] = await Promise.all([loadPortfolio(who), loadQuote()]);
  const holdings = await loadHoldings(who.address, data, quote);
  let activity: Awaited<ReturnType<typeof loadActivity>> = [];
  try {
    activity = await loadActivity(who.address, data);
  } catch {
    activity = [];
  }
  return (
    <main className="px-4 pb-6 pt-4">
      <header className="mb-5 flex items-center justify-between">
        <span className="font-semibold tracking-tight">RvessFlow</span>
        <Link href="/settings" aria-label="Menu" className="grid size-9 place-items-center text-foreground">
          <IconMenu className="size-5" />
        </Link>
      </header>
      <Greeting name={data.me.name} />
      <p className="mt-1 text-sm text-muted-foreground">Save. Stream. Grow.</p>
      <BalanceCard
        totalUsd={holdings.totalUsd}
        totalLocal={holdings.totalLocal}
        localUnit={holdings.localUnit}
        rows={holdings.rows}
        available={holdings.available}
        streaming={holdings.streaming}
        locked={holdings.locked}
      />
      <nav className="mt-4 grid grid-cols-3 gap-2" aria-label="Start">
        <RoundLink href="/goals/new" icon={<IconDown className="size-5" />} label="Save" />
        <RoundLink href="/goals/new?kind=flow" icon={<IconPlay className="size-5" />} label="Stream" />
        <RoundLink href="/vaults/new" icon={<IconLock className="size-5" />} label="Lock" />
      </nav>
      <div className="mt-6 mb-3 flex items-end justify-between">
        <h2 className="text-base font-semibold">Your activity</h2>
        <Link href="/home/activity" className="text-sm font-medium">
          See all
        </Link>
      </div>
      <ActivityList items={activity.slice(0, 5)} quote={quote} />
    </main>
  );
}

function RoundLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-1.5 py-2 text-xs font-medium">
      <span className="grid size-12 place-items-center rounded-full border border-border bg-card">{icon}</span>
      {label}
    </Link>
  );
}
