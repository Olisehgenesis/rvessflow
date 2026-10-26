import Link from "next/link";
import { HomeBalance } from "@/components/balance-card";
import { Greeting } from "@/components/greeting";
import { IconBell, IconBolt, IconChevron, IconLock, IconMark, IconPeople, IconTarget } from "@/components/icons";
import { ActivityList } from "@/components/activity-list";
import { PrivateLine, PrivateUsd } from "@/components/private-money";
import { TokenIcon } from "@/components/token-icon";
import { hasTokenAmount, isWelcomeHome } from "@/lib/home-math";
import { loadActivity, type ActivityView } from "@/lib/activity";
import { loadHoldings, type HoldingRow, type HoldingsView } from "@/lib/holdings";
import { loadPortfolio } from "@/lib/protocol";
import { loadQuote } from "@/lib/rates";
import type { Address } from "viem";

const actions = [
  {
    href: "/goals/new",
    title: "Save",
    body: "Set goals and watch your money grow",
    short: "Set goals",
    icon: IconTarget,
    well: "bg-[#D4F06B] text-[#1C2A14]",
  },
  {
    href: "/goals/new?kind=flow",
    title: "Stream",
    body: "Send and receive recurring payments",
    short: "Recurring payments",
    icon: IconBolt,
    well: "bg-[#E4D9FF] text-[#6A4ED4]",
  },
  {
    href: "/vaults/new",
    title: "Lock",
    body: "Keep your funds safe until the right time",
    short: "Fixed term savings",
    icon: IconLock,
    well: "bg-[#D4F06B] text-[#1C2A14]",
  },
  {
    href: "/groups/new",
    title: "Groups",
    body: "Save together with trusted people",
    short: "Save together",
    icon: IconPeople,
    well: "bg-[#DDD4FF] text-[#6550C4]",
  },
] as const;

export async function HomeScreen({
  who,
  notice,
}: {
  who: { address: Address; name: string; index: number };
  notice?: string;
}) {
  const [data, quote] = await Promise.all([loadPortfolio(who), loadQuote()]);
  const holdings = await loadHoldings(who.address, data, quote);
  let activity: ActivityView[] = [];
  try {
    activity = await loadActivity(who.address, data);
  } catch {
    activity = [];
  }
  const welcome = isWelcomeHome({
    goals: data.flows.length,
    locks: data.locks.length,
    amounts: holdings.rows.map((row) => row.amount),
  });
  return (
    <main className="px-4 pt-4 pb-8">
      {notice ? (
        <p className="mb-4 rounded-2xl bg-[#141B2D] px-3 py-2 text-xs leading-relaxed text-[#F4F6EF]">{notice}</p>
      ) : null}
      <HomeHeader name={who.name} alert={activity.length > 0} />
      {welcome ? <WelcomeHome /> : <FundedHome name={who.name} holdings={holdings} activity={activity} quote={quote} />}
    </main>
  );
}

function HomeHeader({ name, alert }: { name: string; alert: boolean }) {
  const initial = name.trim().charAt(0).toUpperCase() || "R";
  return (
    <header className="mb-5 flex items-center justify-between">
      <Link href="/home" className="flex items-center gap-2 text-base font-semibold tracking-tight">
        <IconMark className="size-8" />
        RvessFlow
      </Link>
      <div className="flex items-center gap-2">
        <Link href="/home/activity" aria-label="Activity" className="relative grid size-10 place-items-center rounded-full bg-card shadow-[0_6px_16px_rgba(20,27,45,0.06)]">
          <IconBell className="size-5" />
          {alert ? <span className="absolute top-2 right-2 size-2 rounded-full bg-[#E39A45]" /> : null}
        </Link>
        <Link
          href="/settings"
          aria-label={`${name} account`}
          className="grid size-10 place-items-center rounded-full bg-[#E7E0FF] text-sm font-semibold text-[#3C2F78]"
        >
          {initial}
        </Link>
      </div>
    </header>
  );
}

function FundedHome({
  name,
  holdings,
  activity,
  quote,
}: {
  name: string;
  holdings: HoldingsView;
  activity: ActivityView[];
  quote: Awaited<ReturnType<typeof loadQuote>>;
}) {
  const held = holdings.rows.filter((row) => hasTokenAmount(row.amount));
  return (
    <>
      <Greeting name={name} />
      <HomeBalance
        totalUsd={holdings.totalUsd}
        totalUsdc={holdings.totalUsdc}
        totalLocal={holdings.totalLocal}
        localUnit={holdings.localUnit}
        available={holdings.available}
        availableUsdc={holdings.availableUsdc}
        streaming={holdings.streaming}
        streamingUsdc={holdings.streamingUsdc}
        locked={holdings.locked}
        lockedUsdc={holdings.lockedUsdc}
      />
      <section className="mt-6">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-base font-semibold">Your assets</h2>
          <Link href="/home/assets" className="text-sm font-medium text-muted-foreground">
            View all
          </Link>
        </div>
        <AssetList rows={held.length > 0 ? held : holdings.rows} localUnit={holdings.localUnit} />
      </section>
      <section className="mt-6 grid grid-cols-4 gap-2" aria-label="Quick actions">
        {actions.map((action) => (
          <ActionLink key={action.title} href={action.href} title={action.title} detail={action.body} icon={action.icon} well={action.well} />
        ))}
      </section>
      <section className="mt-6">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-base font-semibold">Recent activity</h2>
          <Link href="/home/activity" className="text-sm font-medium text-muted-foreground">
            View all
          </Link>
        </div>
        <ActivityList items={activity.slice(0, 4)} quote={quote} />
      </section>
    </>
  );
}

function WelcomeHome() {
  return (
    <>
      <div className="relative">
        <img src="/home/robot.webp" alt="" className="pointer-events-none absolute -top-1 right-0 w-28" />
        <h1 className="max-w-[12.5rem] font-display text-[2rem] font-semibold leading-[1.05] tracking-tight">
          Welcome to RvessFlow
        </h1>
        <p className="mt-3 max-w-[16rem] text-sm leading-relaxed text-muted-foreground">
          Your money, your way. Start saving, streaming, locking and growing today.
        </p>
      </div>
      <section className="relative z-10 mt-6 rounded-3xl border border-border/70 bg-card p-4 shadow-[0_10px_28px_rgba(20,27,45,0.06)]">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#D4F06B] text-[#1C2A14]">
            <IconTarget className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">Get started with your first goal</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Set a goal, add funds and watch your money grow — step by step.</p>
          </div>
        </div>
        <Link href="/goals/new" className="mt-4 flex h-12 items-center justify-center gap-2 rounded-full bg-[#141B2D] text-sm font-medium text-white">
          Create your first goal
          <span aria-hidden>→</span>
        </Link>
      </section>
      <section className="mt-4 rounded-3xl border border-border/70 bg-card p-4 shadow-[0_10px_28px_rgba(20,27,45,0.06)]">
        <h2 className="text-base font-semibold">Explore what you can do</h2>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {actions.map((action) => (
            <ActionLink key={action.title} href={action.href} title={action.title} detail={action.short} icon={action.icon} well={action.well} />
          ))}
        </div>
      </section>
      <section className="mt-4 flex gap-3 rounded-3xl border border-border/70 bg-card p-4 shadow-[0_10px_28px_rgba(20,27,45,0.06)]">
        <img src="/home/pins.webp" alt="" className="size-20 shrink-0 object-contain" />
        <div>
          <h2 className="font-semibold">Your money is already on Base</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Use USDCx, ETHx and more to start building your financial future.</p>
          <Link href="/home/add" className="mt-2 inline-flex items-center gap-1 text-sm font-medium">
            Learn more <span aria-hidden>→</span>
          </Link>
        </div>
      </section>
      <section className="mt-4 rounded-3xl bg-[#E7E0FF] px-4 py-5">
        <p className="font-display text-lg font-medium leading-snug tracking-tight">“ Small steps today, bigger dreams tomorrow.</p>
        <div className="mt-3 flex items-end justify-between">
          <svg viewBox="0 0 88 28" className="h-6 w-20 text-[#7DDE55]" aria-hidden>
            <path d="M2 16c10-10 16 10 26 0s16 10 26 0 16 10 26 0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <img src="/home/cube.webp" alt="" className="w-12" />
        </div>
      </section>
    </>
  );
}

function ActionLink({
  href,
  title,
  detail,
  icon: Icon,
  well,
}: {
  href: string;
  title: string;
  detail: string;
  icon: typeof IconTarget;
  well: string;
}) {
  return (
    <Link href={href} className="flex flex-col items-center text-center">
      <span className={`grid size-12 place-items-center rounded-full ${well}`}>
        <Icon className="size-5" />
      </span>
      <span className="mt-2 text-xs font-semibold">{title}</span>
      <span className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{detail}</span>
    </Link>
  );
}

export function AssetList({ rows, localUnit }: { rows: HoldingRow[]; localUnit?: string }) {
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.key} id={row.key}>
          <Link href={assetHref(row)} className="flex items-center gap-3 rounded-3xl border border-border/70 bg-card px-3.5 py-3 shadow-[0_10px_28px_rgba(20,27,45,0.05)]">
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
