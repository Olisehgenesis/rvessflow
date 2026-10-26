import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import Loading from "../loading";
import { ActivityList } from "@/components/activity-list";
import { BalanceCard } from "@/components/balance-card";
import { Greeting } from "@/components/greeting";
import { IconChevron, IconDown, IconLock, IconMark, IconPeople, IconPlay } from "@/components/icons";
import { ProfileAvatar } from "@/components/profile-avatar";
import { loadActivity } from "@/lib/activity";
import { loadHoldings, type HoldingRow } from "@/lib/holdings";
import { loadQuote } from "@/lib/rates";
import { loadPortfolio, networkName, stableLabel } from "@/lib/protocol";
import { viewer } from "@/lib/session";
import type { Quote } from "@/lib/quote";

export default function HomePage() {
  return (
    <Suspense fallback={<Loading />}>
      <HomeBody />
    </Suspense>
  );
}

function quiet(value: string) {
  const amount = Number(value.replace(/,/g, ""));
  return !Number.isFinite(amount) || amount === 0;
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
  const empty = quiet(holdings.totalUsd) && activity.length === 0;
  const held = holdings.rows.filter((row) => !quiet(row.usd));
  return (
    <main className="px-4 pt-4 pb-6">
      <header className="mb-5 flex items-center justify-between">
        <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <IconMark className="size-7" />
          RvessFlow
        </span>
        <span className="flex items-center gap-1.5">
          <Link href="/home/activity" aria-label="Activity" className="grid size-9 place-items-center rounded-full text-foreground">
            <Bell className="size-5" />
          </Link>
          <Link href="/settings" aria-label="Profile" className="rounded-full ring-2 ring-[#D6F34A]">
            <ProfileAvatar seed={who.address} />
          </Link>
        </span>
      </header>
      {empty ? <Welcome /> : <Filled name={data.me.name} holdings={holdings} held={held} activity={activity} quote={quote} />}
    </main>
  );
}

function Filled({
  name,
  holdings,
  held,
  activity,
  quote,
}: {
  name: string;
  holdings: Awaited<ReturnType<typeof loadHoldings>>;
  held: HoldingRow[];
  activity: Awaited<ReturnType<typeof loadActivity>>;
  quote: Quote;
}) {
  return (
    <>
      <Greeting name={name} />
      <p className="mt-1 text-sm text-muted-foreground">Save. Stream. Lock. Grow.</p>
      <BalanceCard
        totalUsd={holdings.totalUsd}
        totalLocal={holdings.totalLocal}
        localUnit={holdings.localUnit}
        available={holdings.available}
        streaming={holdings.streaming}
        locked={holdings.locked}
      />
      {held.length > 0 ? (
        <section className="mt-6">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-base font-semibold">Your assets</h2>
            <Link href="/home/add" className="text-sm font-medium">
              View all
            </Link>
          </div>
          <ul className="overflow-hidden rounded-[1.4rem] border border-border bg-card">
            {held.map((row) => (
              <li key={row.key} className="border-b border-border last:border-b-0">
                <Link href="/home/add/crypto" className="flex items-center gap-3 px-3.5 py-3">
                  <AssetMark kind={row.key} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{row.label}</span>
                    <span className="block text-xs text-muted-foreground">{networkName}</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm font-semibold tabular-nums">${row.usd}</span>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {row.amount} {row.label}
                    </span>
                  </span>
                  <IconChevron className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <nav className="mt-5 grid grid-cols-4 gap-2" aria-label="Start">
        <RoundLink href="/goals/new" icon={<IconDown className="size-5" />} label="Save" body="Set goals and watch your money grow." well="bg-[#E7F6D8] text-[#3C9A34]" />
        <RoundLink href="/goals/new?kind=flow" icon={<IconPlay className="size-5" />} label="Stream" body="Send and receive recurring payments." well="bg-[#EDE7FF] text-[#7A5CDB]" />
        <RoundLink href="/vaults" icon={<IconLock className="size-5" />} label="Lock" body="Keep your funds safe until the right time." well="bg-[#E7F6D8] text-[#3C9A34]" />
        <RoundLink href="/groups" icon={<IconPeople className="size-5" />} label="Groups" body="Save together with trusted people." well="bg-[#E5F0FF] text-[#3B82F6]" />
      </nav>
      <div className="mt-6 mb-3 flex items-end justify-between">
        <h2 className="text-base font-semibold">Recent activity</h2>
        <Link href="/home/activity" className="text-sm font-medium">
          View all
        </Link>
      </div>
      <ActivityList items={activity.slice(0, 4)} quote={quote} />
    </>
  );
}

function Welcome() {
  return (
    <>
      <h1 className="font-display text-[2rem] leading-[1.05] font-semibold tracking-tight">Welcome to RvessFlow</h1>
      <p className="mt-2 max-w-[18rem] text-sm leading-relaxed text-muted-foreground">
        Your money, your way. Start saving, streaming, locking and growing today.
      </p>
      <section className="mt-5 rounded-[1.4rem] border border-[#E3EDD4] bg-[#F7FBEA] p-4">
        <span className="grid size-11 place-items-center rounded-full bg-[#D6F34A] text-[#141414]">
          <IconDown className="size-5" />
        </span>
        <h2 className="mt-3 text-base font-semibold">Get started with your first goal</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Set a goal, add funds, and watch your money grow.</p>
        <Link href="/goals/new" className="mt-4 flex h-12 items-center justify-center gap-2 rounded-full bg-[#171717] text-sm font-medium text-white">
          Create your first goal
          <span aria-hidden="true">→</span>
        </Link>
        <Link href="/home/add" className="mt-2 flex h-12 items-center justify-center gap-2 rounded-full bg-[#D6F34A] text-sm font-medium text-[#141414]">
          Top up
          <span aria-hidden="true">→</span>
        </Link>
      </section>
      <section className="mt-4 rounded-[1.4rem] border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Explore what you can do</h2>
        <ul className="mt-4 grid grid-cols-4 gap-2 text-center">
          <Explore href="/goals/new" icon={<IconDown className="size-5" />} label="Save" body="Set goals" well="bg-[#E7F6D8] text-[#3C9A34]" />
          <Explore href="/goals/new?kind=flow" icon={<IconPlay className="size-5" />} label="Stream" body="Recurring payments" well="bg-[#EDE7FF] text-[#7A5CDB]" />
          <Explore href="/vaults" icon={<IconLock className="size-5" />} label="Lock" body="Fixed term savings" well="bg-[#E7F6D8] text-[#3C9A34]" />
          <Explore href="/groups" icon={<IconPeople className="size-5" />} label="Groups" body="Save together" well="bg-[#E5F0FF] text-[#3B82F6]" />
        </ul>
      </section>
      <section className="mt-4 rounded-[1.4rem] border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Your money is already on {networkName}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Use {stableLabel}, ETHx, and more to start building your financial future.</p>
        <Link href="/home/add" className="mt-3 inline-flex items-center gap-1 text-sm font-medium">
          Top up
          <span aria-hidden="true">→</span>
        </Link>
      </section>
      <p className="mt-4 rounded-[1.4rem] bg-[#F3EEFF] px-4 py-4 text-sm leading-relaxed font-medium">
        “Small steps today, bigger dreams tomorrow.”
      </p>
    </>
  );
}

function RoundLink({ href, icon, label, body, well }: { href: string; icon: ReactNode; label: string; body: string; well: string }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-1.5 text-center">
      <span className={`grid size-12 place-items-center rounded-full ${well}`}>{icon}</span>
      <span className="text-xs font-semibold">{label}</span>
      <span className="text-[11px] leading-snug text-muted-foreground">{body}</span>
    </Link>
  );
}

function Explore({ href, icon, label, body, well }: { href: string; icon: ReactNode; label: string; body: string; well: string }) {
  return (
    <li>
      <Link href={href} className="flex flex-col items-center gap-1.5">
        <span className={`grid size-12 place-items-center rounded-full ${well}`}>{icon}</span>
        <span className="text-xs font-semibold">{label}</span>
        <span className="text-[11px] leading-snug text-muted-foreground">{body}</span>
      </Link>
    </li>
  );
}

function AssetMark({ kind }: { kind: string }) {
  const tone = kind === "eth" || kind === "ethx" ? "bg-[#EDE7FF] text-[#7A5CDB]" : kind === "usdt" ? "bg-[#E7F6D8] text-[#1F8A4C]" : "bg-[#E5F0FF] text-[#2563EB]";
  const mark = kind === "eth" || kind === "ethx" ? "Ξ" : kind === "usdt" ? "₮" : "$";
  return <span className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold ${tone}`}>{mark}</span>;
}
