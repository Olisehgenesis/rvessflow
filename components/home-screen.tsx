import { Suspense } from "react";
import Link from "next/link";
import { BalanceError, BalanceSkeleton, HomeBalance } from "@/components/balance-card";
import { Greeting } from "@/components/greeting";
import { IconBell, IconChevron, IconMark } from "@/components/icons";
import { GoalLink } from "@/components/product";
import { ActivityList } from "@/components/activity-list";
import { PrivateLine, PrivateUsd } from "@/components/private-money";
import { ProfileAvatar } from "@/components/profile-avatar";
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
    <main className="px-4 pt-4 pb-8">
      {notice ? <p className="mb-4 rounded-2xl border border-border bg-card px-3 py-2 text-xs leading-relaxed text-muted-foreground">{notice}</p> : null}
      <HomeHeader name={who.name} address={who.address} />
      <Greeting name={who.name} />
      <Suspense fallback={<BalanceSkeleton />}>
        <HomeFigures who={who} />
      </Suspense>
    </main>
  );
}

export function HomeHeader({ name, address, alert = false }: { name: string; address: string; alert?: boolean }) {
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
        <Link href="/settings" aria-label={`${name} account`} className="rounded-full ring-2 ring-[#D6F34A]">
          <ProfileAvatar seed={address} />
        </Link>
      </div>
    </header>
  );
}

async function HomeFigures({ who }: { who: { address: Address; name: string; index: number } }) {
  const loaded = await readHome(who);
  if (!loaded.ok) return <BalanceError message={loaded.message} detail={loaded.detail} />;
  return <HomeReady who={who} portfolio={loaded.portfolio} holdings={loaded.holdings} quote={loaded.quote} />;
}

async function readHome(who: { address: Address; name: string; index: number }) {
  try {
    const portfolio = await loadPortfolio(who);
    const quote = await loadQuote();
    const holdings = await loadHoldings(who.address, portfolio, quote);
    return { ok: true as const, portfolio, quote, holdings };
  } catch (error) {
    console.error(error);
    const detail = error instanceof Error ? error.message : "";
    return { ok: false as const, message: `We could not read the balance on ${networkName}.`, detail };
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
        idleUsd={holdings.idleUsd}
        wallet={holdings.rows
          .filter((row) => (row.key === "usdc" || row.key === "usdt" || row.key === "eth") && row.availability !== "unsupported" && hasTokenAmount(row.amount))
          .map((row) => ({ label: row.label, amount: `${row.amount} ${row.label}`, href: `/home/add/crypto?pay=${row.key}` }))}
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
      {holdings.priceNotes.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {holdings.priceNotes.map((note) => (
            <li key={note} className="text-sm text-muted-foreground">
              {note}
            </li>
          ))}
        </ul>
      ) : null}
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
    { href: "/home/add", title: "Top up your wallet", body: `Receive on ${networkName}, convert crypto you hold, or use a provider that is configured.` },
    { href: "/goals/new", title: "Create your first goal", body: "Optional. A goal is not required before you top up." },
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
      {rows.map((row) => {
        const className = "flex items-center gap-3 px-3.5 py-3";
        const body = (
          <>
            <TokenIcon symbol={row.label} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{row.label}</span>
              <span className="block text-xs text-muted-foreground">{row.network}</span>
            </span>
            <span className="text-right">
              {row.availability === "unsupported" ? (
                <span className="block text-sm text-muted-foreground">Not on this network</span>
              ) : row.availability === "unpriced" ? (
                <span className="block text-sm text-muted-foreground">Price unavailable</span>
              ) : row.local && localUnit ? (
                <span className="block text-sm font-semibold">
                  <PrivateLine value={`${localUnit} ${row.local}`} />
                </span>
              ) : (
                <span className="block text-sm font-semibold">
                  <PrivateUsd value={row.usd} />
                </span>
              )}
              {row.availability === "priced" && row.local && localUnit ? (
                <span className="block text-xs text-muted-foreground">
                  <PrivateUsd value={row.usd} />
                </span>
              ) : null}
              <span className="block text-[11px] text-muted-foreground">
                <PrivateLine value={row.availability === "unsupported" ? row.amount : `${row.amount} ${row.label}`} />
              </span>
            </span>
            {row.availability === "unsupported" ? null : <IconChevron className="size-4 shrink-0 text-muted-foreground" />}
          </>
        );
        return (
          <li key={row.key} id={row.key}>
            {row.availability === "unsupported" ? (
              <div className={className}>{body}</div>
            ) : (
              <Link href={assetHref(row)} className={className}>
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function assetHref(row: HoldingRow) {
  if (row.availability === "unsupported") return "/home/assets";
  if (row.key === "usdc" || row.key === "usdt" || row.key === "eth") return `/home/add/crypto?pay=${row.key}`;
  if (row.key === "ethx" || row.key === "usdcx") return "/goals#locks";
  return "/home/assets";
}
