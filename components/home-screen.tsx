import { Suspense } from "react";
import Link from "next/link";
import { BalanceError, BalanceSkeleton, HomeBalance } from "@/components/balance-card";
import { IconBell, IconChevron } from "@/components/icons";
import { TopBar } from "@/components/top-bar";
import { GoalLink, ProductMark, type ProductKind } from "@/components/product";
import { ActivityList } from "@/components/activity-list";
import { PrivateLine, PrivateUsd } from "@/components/private-money";
import { TokenIcon } from "@/components/token-icon";
import { percent, show } from "@/lib/display";
import { hasTokenAmount, showGettingStarted } from "@/lib/home-math";
import { loadActivity, type ActivityView } from "@/lib/activity";
import { loadHoldings, type HoldingRow, type HoldingsView } from "@/lib/holdings";
import { loadIncoming, loadPortfolio, networkName, type Portfolio } from "@/lib/protocol";
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
    <main className="px-4 pb-8">
      <TopBar title="Home" action={<HomeTools />} />
      {notice ? <p className="mb-4 rounded-2xl border border-border bg-card px-3 py-2 text-xs leading-relaxed text-muted-foreground">{notice}</p> : null}
      <Suspense fallback={<BalanceSkeleton />}>
        <HomeFigures who={who} />
      </Suspense>
    </main>
  );
}

function HomeTools({ alert = false }: { alert?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Link href="/home/activity" aria-label="Activity" className="relative grid size-10 place-items-center rounded-full border border-border bg-card">
        <IconBell className="size-5" />
        {alert ? <span className="absolute top-2 right-2 size-2 rounded-full bg-[#E39A45]" /> : null}
      </Link>
    </div>
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
    const message = error instanceof Error ? error.message : `${networkName} did not return a balance.`;
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
  const incoming = await loadIncoming(who.address);
  const liveIn = incoming.filter((item) => item.flow.active && !item.flow.paused && !item.flow.settled && BigInt(item.flow.rate) > 0n);
  const inflow = liveIn.reduce((sum, item) => sum + BigInt(item.flow.rate), 0n);
  const stillDue = liveIn.reduce((sum, item) => sum + BigInt(item.flow.remaining), 0n);
  const walletWei = BigInt(portfolio.wallet);
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
        totalLocal={holdings.totalLocal}
        localUnit={holdings.localUnit}
        available={holdings.available}
        streaming={holdings.streaming}
        locked={holdings.locked}
        savings={portfolio.flows
          .filter((flow) => flow.kind === "saving" && !flow.settled)
          .map((flow) => ({
            id: flow.id,
            name: flow.name,
            saved: show(flow.saved, quote),
            goal: show(flow.goal, quote),
            progress: percent(flow.saved, flow.goal),
          }))}
        unit={quote.unit}
        network={networkName}
        showWithdraw={funded}
        quote={quote}
        usdcUsd8={holdings.usdcUsd8}
        availableUsd8={holdings.availableUsd8}
        streamingUsd8={holdings.streamingUsd8}
        lockedUsd8={holdings.lockedUsd8}
        pulse={
          inflow > 0n
            ? {
                readAt: portfolio.readAt,
                wallet: portfolio.wallet,
                rate: inflow.toString(),
                ceiling: (walletWei + stillDue).toString(),
                totalUsd8: holdings.totalUsd8,
                availableUsd8: holdings.availableUsd8,
                usdcUsd8: holdings.usdcUsd8,
                quote,
              }
            : undefined
        }
      />
      {portfolio.vault ? null : (
        <p className="mt-3 text-sm text-muted-foreground">
          No savings vault on {networkName} yet. Topping up or opening a goal creates one. You can receive on {networkName} before that.
        </p>
      )}
      {incoming.length > 0 ? (
        <section className="mt-4">
          <h2 className="text-sm font-semibold">Coming in</h2>
          <ul className="mt-2 space-y-3">
            {incoming.map((item) => (
              <li key={`${item.vault}-${item.flow.id}`}>
                <GoalLink
                  flow={item.flow}
                  readAt={portfolio.readAt}
                  quote={quote}
                  caption={`From ${item.from}`}
                  href={`/goals/from/${item.vault}/${item.flow.id}`}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {starting && incoming.length === 0 ? <GettingStarted /> : null}
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
      <QuickActions />
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

const quickActions: { href: string; title: string; body: string; kind: ProductKind }[] = [
  { href: "/goals", title: "Save", body: "Lock money, or get paid every second.", kind: "saving" },
  { href: "/goals/flow", title: "Flow", body: "Receive money every second.", kind: "flow" },
  { href: "/vaults/new", title: "Lock", body: "Keep your funds safe until the right time.", kind: "lock" },
  { href: "/groups/new", title: "Groups", body: "Save together with trusted people.", kind: "group" },
];

function QuickActions() {
  return (
    <ul className="mt-5 grid grid-cols-4 gap-2">
      {quickActions.map((action) => (
        <li key={action.title}>
          <Link href={action.href} className="flex flex-col items-center px-0.5 text-center">
            <ProductMark kind={action.kind} size="lg" />
            <span className="mt-2 text-sm font-semibold">{action.title}</span>
            <span className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{action.body}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function GettingStarted() {
  const steps = [
    { href: "/home/add", title: "Fund your wallet", body: `Receive on ${networkName}, convert crypto you hold, or use a provider that is configured.` },
    { href: "/goals", title: "Choose a saving, flow, or expense", body: "Optional. You can top up before you start one." },
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
              {row.local && localUnit ? (
                <span className="block text-sm font-semibold">
                  <PrivateLine value={`${localUnit} ${row.local}`} />
                </span>
              ) : (
                <span className="block text-sm font-semibold">
                  <PrivateUsd value={row.usd} />
                </span>
              )}
              {row.local && localUnit ? (
                <span className="block text-xs text-muted-foreground">
                  <PrivateUsd value={row.usd} />
                </span>
              ) : null}
              <span className="block text-[11px] text-muted-foreground">
                <PrivateLine value={`${row.amount} ${row.label}`} />
              </span>
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
