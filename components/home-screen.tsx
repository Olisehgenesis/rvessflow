import { Suspense } from "react";
import Link from "next/link";
import { BalanceError, BalanceSkeleton, HomeBalance } from "@/components/balance-card";
import { Greeting } from "@/components/greeting";
import { IconBell, IconChevron, IconMark } from "@/components/icons";
import { ActivityList } from "@/components/activity-list";
import { PrivateLine, PrivateUsd } from "@/components/private-money";
import { TokenIcon } from "@/components/token-icon";
import { hasTokenAmount, showGettingStarted } from "@/lib/home-math";
import { loadActivity, type ActivityView } from "@/lib/activity";
import { loadHoldings, type HoldingRow, type HoldingsView } from "@/lib/holdings";
import { loadPortfolio, type Portfolio } from "@/lib/protocol";
import { loadQuote } from "@/lib/rates";
import type { Quote } from "@/lib/quote";
import type { Address } from "viem";

export async function HomeScreen({
  who,
  notice,
}: {
  who: { address: Address; name: string; index: number };
  notice?: string;
}) {
  return (
    <main className="px-4 pt-4 pb-8">
      {notice ? <p className="mb-4 rounded-2xl border border-border bg-card px-3 py-2 text-xs leading-relaxed text-muted-foreground">{notice}</p> : null}
      <HomeHeader name={who.name} />
      <Greeting name={who.name} />
      <Suspense fallback={<BalanceSkeleton />}>
        <HomeFigures who={who} />
      </Suspense>
    </main>
  );
}

export function HomeHeader({ name, alert = false }: { name: string; alert?: boolean }) {
  const initial = name.trim().charAt(0).toUpperCase() || "R";
  return (
    <header className="mb-5 flex items-center justify-between">
      <Link href="/home" className="flex items-center gap-2 text-base font-semibold tracking-tight">
        <IconMark className="size-8" />
        RvessFlow
      </Link>
      <div className="flex items-center gap-2">
        <Link href="/home/activity" aria-label="Activity" className="relative grid size-10 place-items-center rounded-full border border-border bg-card">
          <IconBell className="size-5" />
          {alert ? <span className="absolute top-2 right-2 size-2 rounded-full bg-[#E39A45]" /> : null}
        </Link>
        <Link
          href="/settings"
          aria-label={`${name} account`}
          className="grid size-10 place-items-center rounded-full border border-border bg-card text-sm font-semibold"
        >
          {initial}
        </Link>
      </div>
    </header>
  );
}

async function HomeFigures({ who }: { who: { address: Address; name: string; index: number } }) {
  const loaded = await readHome(who);
  if (!loaded.ok) return <BalanceError message={loaded.message} />;
  return <HomeReady who={who} portfolio={loaded.portfolio} holdings={loaded.holdings} quote={loaded.quote} />;
}

async function readHome(who: { address: Address; name: string; index: number }) {
  try {
    const portfolio = await loadPortfolio(who);
    const quote = await loadQuote();
    const holdings = await loadHoldings(who.address, portfolio, quote);
    return { ok: true as const, portfolio, quote, holdings };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Base did not return a balance.";
    return { ok: false as const, message };
  }
}

async function HomeReady({
  who,
  portfolio,
  holdings,
  quote,
}: {
  who: { address: Address; name: string; index: number };
  portfolio: Portfolio;
  holdings: HoldingsView;
  quote: Quote;
}) {
  let activity: ActivityView[] = [];
  let activityError = "";
  try {
    activity = await loadActivity(who.address, portfolio);
  } catch (error) {
    activityError = error instanceof Error ? error.message : "Activity could not be loaded.";
  }
  const amounts = holdings.rows.map((row) => row.amount);
  const funded = amounts.some(hasTokenAmount);
  const starting = showGettingStarted({
    goals: portfolio.flows.length,
    locks: portfolio.locks.length,
    groups: portfolio.groups.length,
    amounts,
  });
  const held = holdings.rows.filter((row) => hasTokenAmount(row.amount));
  return (
    <>
      <HomeBalance
        totalUsd={holdings.totalUsd}
        totalUsdc={holdings.totalUsdc}
        totalLocal={holdings.totalLocal}
        localUnit={holdings.localUnit}
        available={holdings.available}
        streaming={holdings.streaming}
        locked={holdings.locked}
        showReceive={funded}
      />
      {portfolio.vault ? null : (
        <p className="mt-3 text-sm text-muted-foreground">No savings vault on Base yet. Adding money or opening a goal creates one. You can receive on Base before that.</p>
      )}
      {starting ? <GettingStarted /> : null}
      {held.length > 0 ? (
        <section className="mt-6">
          <div className="mb-2 flex items-end justify-between">
            <h2 className="text-base font-semibold">Your assets</h2>
            <Link href="/home/assets" className="text-sm font-medium text-muted-foreground">
              View all
            </Link>
          </div>
          <AssetList rows={held} localUnit={holdings.localUnit} />
        </section>
      ) : null}
      {activityError || activity.length > 0 ? (
        <section className="mt-6">
          <div className="mb-2 flex items-end justify-between">
            <h2 className="text-base font-semibold">Recent activity</h2>
            <Link href="/home/activity" className="text-sm font-medium text-muted-foreground">
              View all
            </Link>
          </div>
          {activityError ? (
            <p className="rounded-2xl border border-border bg-card px-4 py-4 text-sm text-muted-foreground" role="alert">
              Activity did not load. {activityError}
            </p>
          ) : (
            <ActivityList items={activity.slice(0, 4)} quote={quote} />
          )}
        </section>
      ) : null}
    </>
  );
}

function GettingStarted() {
  const steps = [
    { href: "/home/add", title: "Fund your wallet", body: "Receive on Base, convert crypto you hold, or use a provider that is configured." },
    { href: "/goals/new", title: "Create your first goal", body: "Optional. A goal is not required before you add money." },
  ];
  return (
    <section className="mt-4">
      <h2 className="text-sm font-semibold">Get started</h2>
      <ul className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {steps.map((step) => (
          <li key={step.href}>
            <Link href={step.href} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{step.title}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{step.body}</span>
              </span>
              <IconChevron className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AssetList({ rows, localUnit }: { rows: HoldingRow[]; localUnit?: string }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {rows.map((row) => (
        <li key={row.key} id={row.key}>
          <Link href={assetHref(row)} className="flex items-center gap-3 px-3.5 py-3">
            <TokenIcon symbol={row.label} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{row.label}</span>
              <span className="block text-xs text-muted-foreground">{row.network}</span>
            </span>
            <span className="text-right">
              <span className="block text-sm font-semibold">
                <PrivateUsd value={row.usd} />
              </span>
              <span className="block text-xs text-muted-foreground">
                <PrivateLine value={`${row.amount} ${row.label}`} />
              </span>
              {row.local && localUnit ? (
                <span className="block text-[11px] text-muted-foreground">
                  <PrivateLine value={`${localUnit} ${row.local}`} />
                </span>
              ) : null}
            </span>
            <IconChevron className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function assetHref(row: HoldingRow) {
  if (row.key === "usdc" || row.key === "usdt" || row.key === "eth") return `/home/add/crypto?pay=${row.key}`;
  if (row.key === "ethx" || row.key === "usdcx") return "/vaults";
  return "/home/assets";
}
