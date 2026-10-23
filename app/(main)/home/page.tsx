import { Suspense } from "react";
import Link from "next/link";
import Loading from "../loading";
import { IconBolt, IconLock, IconMark, IconPeople, IconSeed } from "@/components/icons";
import { CurrencyPick } from "@/components/currency-pick";
import { HomeStream } from "@/components/flowing";
import { WithdrawIdle } from "@/components/forms";
import { GoalLink, KindChoices, LockLink } from "@/components/product";
import { show } from "@/lib/display";
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
  const openFlows = data.flows.filter((flow) => !flow.settled && flow.token.toLowerCase() === "0x1650581f573ead727b92073b5ef8b4f5b94d1648");
  const openLocks = data.locks.filter((lock) => !lock.settled);
  const empty = openFlows.length === 0 && openLocks.length === 0;
  return (
    <main className="px-5 pb-8 pt-6">
      <header className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconMark className="size-7 text-foreground" />
          <span className="font-semibold tracking-tight">RvessFlow</span>
        </div>
        <div className="flex items-center gap-3">
          <CurrencyPick code={quote.code} />
          <Link href="/settings" className="text-sm text-muted-foreground">
            {data.me.name}
          </Link>
        </div>
      </header>
      <HomeStream
        readAt={data.readAt}
        wallet={data.wallet}
        idle={data.idle}
        held={data.held}
        locked={data.locked}
        streams={openFlows
          .filter((flow) => flow.kind !== "saving")
          .map((flow) => ({
            rate: flow.rate,
            remaining: flow.remaining,
            toMe: flow.recipient.toLowerCase() === data.me.address.toLowerCase(),
            live: flow.active && !flow.paused,
          }))}
        quote={quote}
      />
      <nav className="mt-4 grid grid-cols-4 gap-2" aria-label="Start">
        <Link href="/goals/new" className="flex flex-col items-center gap-1 rounded-2xl bg-primary px-2 py-3 text-center text-xs font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground">
          <IconSeed className="size-5" />
          Save
        </Link>
        <Link href="/goals/new?kind=flow" className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-card px-2 py-3 text-center text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground">
          <IconBolt className="size-5" />
          Stream
        </Link>
        <Link href="/vaults/new" className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-card px-2 py-3 text-center text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground">
          <IconLock className="size-5" />
          Lock
        </Link>
        <Link href="/groups/new" className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-card px-2 py-3 text-center text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground">
          <IconPeople className="size-5" />
          Groups
        </Link>
      </nav>
      {BigInt(data.idle) >= 10n ** 16n ? (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-sm">Idle in your vault: {show(data.idle, quote)} {quote.unit}</p>
          <div className="mt-3">
            <WithdrawIdle amount={data.idle} />
          </div>
        </div>
      ) : null}
      <div className="mt-7 mb-3 flex items-end justify-between">
        <h2 className="text-lg font-semibold">Your goals</h2>
        <Link href="/goals/new" className="text-sm font-medium text-foreground">
          Create goal
        </Link>
      </div>
      {empty ? (
        <KindChoices />
      ) : (
        <ul className="divide-y divide-border">
          {openFlows.map((flow) => (
            <li key={flow.id}>
              <GoalLink flow={flow} readAt={data.readAt} quote={quote} />
            </li>
          ))}
          {openLocks.map((lock) => (
            <li key={lock.id}>
              <LockLink lock={lock} quote={quote} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

