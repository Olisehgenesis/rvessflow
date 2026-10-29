import { Suspense } from "react";
import Link from "next/link";
import { BalanceError, BalanceSkeleton, HomeBalance } from "@/components/balance-card";
import { DeskHello } from "@/components/desk-hello";
import { IconBell, IconChevron } from "@/components/icons";
import { TopBar } from "@/components/top-bar";
import { AccountMark } from "@/components/account-mark";
import { GoalLink, LockLink, ProductMark, type ProductKind } from "@/components/product";
import { ActivityList } from "@/components/activity-list";
import { AssetList } from "@/components/asset-list";
import { PrivateLine, PrivateUsd } from "@/components/private-money";
import { percent, show } from "@/lib/display";
import { hasTokenAmount, showGettingStarted } from "@/lib/home-math";
import { loadActivity, type ActivityView } from "@/lib/activity";
import { loadHoldings, type HoldingsView } from "@/lib/holdings";
import { loadIncoming, loadPortfolio, networkName, type IncomingItem, type Portfolio } from "@/lib/protocol";
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
    <main className="px-4 pb-8 lg:px-0">
      <TopBar title="Home" action={<HomeTools />} desk={false} />
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
  return <HomeReady who={who} portfolio={loaded.portfolio} holdings={loaded.holdings} quote={loaded.quote} incoming={loaded.incoming} />;
}

async function readHome(who: { address: Address; name: string; index: number }) {
  try {
    const portfolioPromise = loadPortfolio(who, "home");
    const quotePromise = loadQuote();
    const incomingPromise = loadIncoming(who.address);
    const [portfolio, quote, incoming] = await Promise.all([portfolioPromise, quotePromise, incomingPromise]);
    const holdings = await loadHoldings(who.address, portfolio, quote);
    return { ok: true as const, portfolio, quote, holdings, incoming };
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
  incoming,
}: {
  who: { address: Address; name: string; index: number };
  portfolio: Portfolio;
  holdings: HoldingsView;
  quote: Quote;
  incoming: IncomingItem[];
}) {
  const me = who.address.toLowerCase();
  const liveIn = incoming.filter((item) => item.flow.active && !item.flow.paused && !item.flow.settled && BigInt(item.flow.rate) > 0n);
  const liveOwn = portfolio.flows.filter((flow) => flow.active && !flow.paused && !flow.settled && BigInt(flow.rate) > 0n);
  const liveSelf = liveOwn.filter((flow) => flow.recipient.toLowerCase() === me);
  const inWeiPerSec = liveIn.reduce((sum, item) => sum + BigInt(item.flow.rate), 0n) + liveSelf.reduce((sum, flow) => sum + BigInt(flow.rate), 0n);
  const streamWeiPerSec = liveOwn.reduce((sum, flow) => sum + BigInt(flow.rate), 0n);
  const inCapWei = liveIn.reduce((sum, item) => sum + BigInt(item.flow.remaining), 0n) + liveSelf.reduce((sum, flow) => sum + BigInt(flow.remaining), 0n);
  const streamRemainingWei = BigInt(portfolio.streaming);
  const amounts = holdings.rows.map((row) => row.amount);
  const funded = amounts.some(hasTokenAmount);
  const starting = showGettingStarted({
    goals: portfolio.flows.length,
    locks: portfolio.locks.length,
    groups: portfolio.groups.length,
    amounts,
  });
  const assets = holdings.rows;
  const openFlows = portfolio.flows.filter((flow) => !flow.settled);
  function balanceCard(layout?: "desk") {
    return (
    <HomeBalance
        layout={layout}
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
          inWeiPerSec > 0n || streamWeiPerSec > 0n
            ? {
                readAt: portfolio.readAt,
                inWeiPerSec: inWeiPerSec.toString(),
                inCapWei: inCapWei.toString(),
                streamWeiPerSec: streamWeiPerSec.toString(),
                streamRemainingWei: streamRemainingWei.toString(),
                totalUsd8: holdings.totalUsd8,
                availableUsd8: holdings.availableUsd8,
                streamingUsd8: holdings.streamingUsd8,
                lockedUsd8: holdings.lockedUsd8,
                usdcUsd8: holdings.usdcUsd8,
                quote,
              }
            : undefined
        }
      />
    );
  }
  return (
    <>
      <div className="hidden lg:block">
        <div className="flex items-start justify-between gap-4">
          <div>
            <DeskHello name={who.name} />
            <p className="mt-2 text-sm text-[#5C6572]">Save. Stream. Lock. Grow.</p>
          </div>
          <div className="flex items-center gap-2">
            <HomeTools />
            <AccountMark />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.78fr)]">
          <div className="space-y-5">
            {balanceCard("desk")}
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {deskActions.map((action) => (
                <li key={action.title}>
                  <Link href={action.href} className="flex h-full flex-col items-center rounded-2xl border border-[#E6EADF] bg-white px-3 py-4 text-center shadow-[0_1px_0_rgba(20,20,20,0.04)] transition-colors duration-150 hover:border-[#C9D7A4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] motion-safe:active:scale-[0.98]">
                    <span className={`grid size-14 place-items-center rounded-2xl ${action.well}`}>
                      <ProductMark kind={action.kind} size="md" />
                    </span>
                    <span className="mt-3 text-sm font-semibold text-[#141414]">{action.title}</span>
                    <span className="mt-1 text-[11px] leading-snug text-[#5C6572]">{action.body}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {openFlows.length > 0 ? (
              <section>
                <div className="mb-2 flex items-end justify-between">
                  <h2 className="text-base font-semibold">Goals and streams</h2>
                  <Link href="/goals" className="text-sm font-medium text-[#5C6572]">
                    View all
                  </Link>
                </div>
                <ul className="grid gap-3 lg:grid-cols-2">
                  {openFlows.slice(0, 4).map((flow) => (
                    <li key={flow.id}>
                      <GoalLink flow={flow} readAt={portfolio.readAt} quote={quote} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {portfolio.locks.length > 0 ? (
              <section>
                <div className="mb-2 flex items-end justify-between">
                  <h2 className="text-base font-semibold">Locks</h2>
                  <Link href="/vaults" className="text-sm font-medium text-[#5C6572]">
                    View all
                  </Link>
                </div>
                <ul className="grid gap-3">
                  {portfolio.locks.slice(0, 2).map((lock) => (
                    <li key={lock.id}>
                      <LockLink lock={lock} quote={quote} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <section>
              <div className="mb-2 flex items-end justify-between">
                <h2 className="text-base font-semibold">Your assets</h2>
                <Link href="/home/assets" className="text-sm font-medium text-[#5C6572]">
                  View all
                </Link>
              </div>
              <AssetList rows={assets} localUnit={holdings.localUnit} desk />
              {funded ? null : (
                <Link href="/home/add" className="mt-3 inline-flex h-11 items-center rounded-full bg-[#D6F34A] px-4 text-sm font-semibold text-[#17210C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]">
                  Top up
                </Link>
              )}
            </section>
            {starting ? (
              <StartBanner href="/home/add" title="Start building your future" body="Top up this account. A saving, stream, or lock can start after the money arrives." cta="Top up" />
            ) : openFlows.length === 0 && portfolio.locks.length === 0 && portfolio.groups.length === 0 ? (
              <StartBanner href="/goals" title="Start building your future" body="Open a saving, set up a stream, or lock funds until a date." cta="Create now" />
            ) : null}
          </div>
          <div className="space-y-5">
            <Suspense fallback={<p className="text-sm text-[#5C6572]">Loading activity…</p>}>
              <RecentActivity who={who} portfolio={portfolio} quote={quote} desk />
            </Suspense>
            {incoming.length > 0 ? (
              <section>
                <h2 className="text-base font-semibold">Coming in</h2>
                <ul className="mt-2 space-y-3">
                  {incoming.map((item) => (
                    <li key={`${item.vault}-${item.flow.id}`}>
                      <GoalLink flow={item.flow} readAt={portfolio.readAt} quote={quote} caption={`From ${item.from}`} href={`/goals/from/${item.vault}/${item.flow.id}`} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {portfolio.groups.length > 0 ? (
              <Link href="/groups" className="flex min-h-14 items-center justify-between rounded-3xl border border-[#E6EADF] bg-white px-4 py-3 text-sm shadow-[0_1px_0_rgba(20,20,20,0.04)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]">
                <span className="font-semibold">{portfolio.groups.length === 1 ? "1 group" : `${portfolio.groups.length} groups`}</span>
                <span className="text-[#5C6572]">Open</span>
              </Link>
            ) : null}
          </div>
        </div>
      </div>
      <div className="lg:hidden">
      {balanceCard()}
      {portfolio.vault ? null : (
        <p className="mt-3 text-sm text-muted-foreground">
          No savings vault on {networkName} yet. Topping up or opening a goal creates one. You can receive on Base and Celo before that.
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
      <section className="mt-6">
        <div className="mb-2 flex items-end justify-between">
          <h2 className="text-base font-semibold">Your assets</h2>
          <Link href="/home/assets" className="text-sm font-medium text-muted-foreground">
            View all
          </Link>
        </div>
        <AssetList rows={assets} localUnit={holdings.localUnit} />
      </section>
      <QuickActions />
      <Suspense fallback={<p className="mt-6 text-sm text-muted-foreground">Loading activity…</p>}>
        <RecentActivity who={who} portfolio={portfolio} quote={quote} />
      </Suspense>
      </div>
    </>
  );
}

async function RecentActivity({
  who,
  portfolio,
  quote,
  desk = false,
}: {
  who: { address: Address; name: string; index: number };
  portfolio: Portfolio;
  quote: Quote;
  desk?: boolean;
}) {
  let activity: ActivityView[] = [];
  let activityError = "";
  try {
    activity = await loadActivity(who.address, portfolio);
  } catch (error) {
    activityError = error instanceof Error ? error.message : "Activity could not be loaded.";
  }
  if (!activityError && activity.length === 0 && !desk) return null;
  return (
    <section className={desk ? "" : "mt-6"}>
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
        <ActivityList items={activity.slice(0, 4)} quote={quote} desk={desk} />
      )}
    </section>
  );
}

const deskActions: { href: string; title: string; body: string; kind: ProductKind; well: string }[] = [
  { href: "/goals", title: "Save", body: "Set goals", kind: "saving", well: "bg-[#E7F4C4]" },
  { href: "/goals/flow", title: "Stream", body: "Recurring payments", kind: "flow", well: "bg-[#EDE4FF]" },
  { href: "/vaults", title: "Lock", body: "Fixed-term savings", kind: "lock", well: "bg-[#E5F6D8]" },
  { href: "/groups", title: "Groups", body: "Save together", kind: "group", well: "bg-[#E3F3EA]" },
];

function StartBanner({ href, title, body, cta }: { href: string; title: string; body: string; cta: string }) {
  return (
    <section className="flex items-center justify-between gap-4 overflow-hidden rounded-[1.75rem] border border-[#D7E7B0] bg-[#E7F4C4] px-5 py-4">
      <div className="min-w-0">
        <h2 className="font-[family-name:var(--font-manrope)] text-lg font-semibold tracking-[-0.03em] text-[#141414]">{title}</h2>
        <p className="mt-1 max-w-md text-sm leading-relaxed text-[#3C4A2E]">{body}</p>
        <Link href={href} className="mt-3 inline-flex h-11 items-center rounded-full bg-[#17210C] px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]">
          {cta}
        </Link>
      </div>
      <img src="/saved.jpg" alt="" className="hidden size-24 shrink-0 rounded-2xl object-cover sm:block" />
    </section>
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
    { href: "/home/add", title: "Fund your wallet", body: "Receive on Base and Celo, convert crypto you hold, or use a provider that is configured. Card and mobile money deliver USDC on Base." },
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
