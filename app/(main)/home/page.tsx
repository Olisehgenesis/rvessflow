import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import Loading from "../loading";
import { Greeting } from "@/components/greeting";
import { IconBolt, IconLock, IconMore, IconSeed } from "@/components/icons";
import { WithdrawIdle } from "@/components/forms";
import { goalFigures, goalStatus } from "@/components/product";
import { when } from "@/components/ui-bits";
import { show } from "@/lib/display";
import { loadQuote } from "@/lib/rates";
import { addresses, loadPortfolio, type FlowRow, type LockRow } from "@/lib/protocol";
import type { Quote } from "@/lib/quote";
import { viewer } from "@/lib/session";

export default function HomePage() {
  return (
    <Suspense fallback={<Loading />}>
      <HomeBody />
    </Suspense>
  );
}

function add(left: string, right: string) {
  return (BigInt(left) + BigInt(right)).toString();
}

async function HomeBody() {
  const who = await viewer();
  const [data, quote] = await Promise.all([loadPortfolio(who), loadQuote()]);
  const token = addresses.fusdcx.toLowerCase();
  const flows = data.flows.filter((flow) => flow.token.toLowerCase() === token);
  const locks = data.locks.filter((lock) => !lock.settled);
  const openFlows = flows.filter((flow) => !flow.settled);
  const available = add(add(data.wallet, data.idle), data.held);
  const activity = [
    ...openFlows.map((flow) => flowActivity(flow, data.readAt, quote)),
    ...locks.map((lock) => lockActivity(lock, quote)),
  ].slice(0, 5);
  return (
    <main className="px-4 pb-6 pt-4">
      <header className="mb-5 flex items-center justify-between">
        <span className="font-semibold tracking-tight">RvessFlow</span>
        <Link href="/settings" aria-label="More" className="grid size-9 place-items-center text-foreground">
          <IconMore className="size-5" />
        </Link>
      </header>
      <Greeting name={data.me.name} />
      <p className="mt-1 text-sm text-muted-foreground">Save. Stream. Grow.</p>
      <section className="mt-5 rounded-2xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">Total balance</p>
        <p className="mt-1 font-display text-3xl font-semibold tracking-tight tabular-nums">
          {quote.unit} {show(data.total, quote)}
        </p>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Available</dt>
            <dd className="mt-1 font-medium tabular-nums">{quote.unit} {show(available, quote)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Streaming</dt>
            <dd className="mt-1 font-medium tabular-nums">{quote.unit} {show(data.streaming, quote)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Locked</dt>
            <dd className="mt-1 font-medium tabular-nums">{quote.unit} {show(data.locked, quote)}</dd>
          </div>
        </dl>
      </section>
      <nav className="mt-4 grid grid-cols-3 gap-2" aria-label="Start">
        <RoundLink href="/goals/new" icon={<IconSeed className="size-5" />} label="Save" />
        <RoundLink href="/goals/new?kind=flow" icon={<IconBolt className="size-5" />} label="Stream" />
        <RoundLink href="/vaults/new" icon={<IconLock className="size-5" />} label="Lock" />
      </nav>
      {BigInt(data.idle) >= 10n ** 16n ? (
        <div className="mt-4">
          <p className="mb-2 text-sm text-muted-foreground">Idle in the vault: {quote.unit} {show(data.idle, quote)}</p>
          <WithdrawIdle amount={data.idle} />
        </div>
      ) : null}
      <div className="mt-6 mb-3 flex items-end justify-between">
        <h2 className="text-base font-semibold">Your activity</h2>
        <Link href="/goals" className="text-sm font-medium">See all</Link>
      </div>
      {activity.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card px-4 py-5 text-sm text-muted-foreground">Nothing is moving yet. Save, stream, or lock to start.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {activity.map((item) => (
            <li key={item.id}>
              <Link href={item.href} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums">{item.amount}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
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

function flowActivity(flow: FlowRow, readAt: number, quote: Quote) {
  const { part, label } = goalFigures(flow);
  const status = goalStatus(flow, readAt);
  return {
    id: `flow-${flow.id}`,
    href: `/goals/${flow.id}`,
    title: flow.kind === "saving" ? "Saved to goal" : flow.kind === "expense" ? "Expense stream" : "Streamed",
    detail: `${flow.name} · ${label} · ${status}`,
    amount: `${quote.unit} ${show(part, quote)}`,
    when: when(flow.end || flow.start || flow.earliestStart),
  };
}

function lockActivity(lock: LockRow, quote: Quote) {
  return {
    id: `lock-${lock.id}`,
    href: `/vaults/${lock.id}`,
    title: "Locked",
    detail: `${lock.name} · until ${when(lock.end)}`,
    amount: `${quote.unit} ${show(lock.principal, quote)}`,
    when: when(lock.end),
  };
}
