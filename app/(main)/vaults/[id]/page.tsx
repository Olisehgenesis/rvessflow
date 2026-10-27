import { Suspense } from "react";
import { notFound } from "next/navigation";
import Loading from "../../loading";
import { BreakLock, MatureLock, TopUpLock } from "@/components/forms";
import { ProductMark } from "@/components/product";
import { Fact, Facts, Notice, Page, when } from "@/components/ui-bits";
import { labeled } from "@/lib/display";
import { loadPayChoices } from "@/lib/holdings";
import { loadQuote } from "@/lib/rates";
import { addresses, loadPortfolio } from "@/lib/protocol";
import { viewer } from "@/lib/session";

export default function LockPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <LockBody params={params} />
    </Suspense>
  );
}

async function LockBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const who = await viewer();
  const [data, quote] = await Promise.all([loadPortfolio(who), loadQuote()]);
  const lock = data.locks.find((item) => item.id === id);
  if (!lock) notFound();
  const usdLock = lock.token.toLowerCase() === addresses.fusdcx.toLowerCase();
  const choices = usdLock ? await loadPayChoices(who.address) : undefined;
  const now = data.readAt;
  const mature = now >= lock.end;
  return (
    <Page title={lock.name} back="/vaults">
      <div className="contents lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)] lg:items-start lg:gap-6">
      <div className="lg:rounded-3xl lg:border lg:border-[#E6EADF] lg:bg-white lg:p-6 lg:shadow-[0_1px_0_rgba(20,20,20,0.04)]">
      <div className="mb-4">
        <ProductMark kind="lock" size="xl" quiet={lock.settled} />
        <p className="mt-3 text-sm text-muted-foreground">{lock.settled ? "Closed" : mature ? "Ready" : "Locked"}</p>
      </div>
      <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">{labeled(lock.principal, quote)}</p>
      <p className="text-sm text-muted-foreground">Locked.</p>
      {BigInt(lock.target) > 0n ? <p className="text-sm text-muted-foreground">Target {labeled(lock.target, quote)}.</p> : null}
      <div className="mt-5">
        <Facts>
          <Fact label="Ends" value={when(lock.end)} />
          <Fact label="Penalty on this lock" value={`${(lock.penaltyBps / 100).toFixed(2).replace(/\.00$/, "")}%`} />
          <Fact label="Early payout" value={labeled(lock.breakPayout, quote)} />
          <Fact label="Early penalty" value={labeled(lock.breakPenalty, quote)} />
          <Fact label="Bonus if held" value={BigInt(lock.matureBonus) > 0n ? labeled(lock.matureBonus, quote) : "None in the pool"} />
          <Fact label="Yield stream" value={BigInt(lock.yieldRate) > 0n ? "On, from the reward budget" : "Off"} />
        </Facts>
      </div>
      </div>
      {lock.settled ? null : (
      <div className="lg:rounded-3xl lg:border lg:border-[#E6EADF] lg:bg-white lg:p-6 lg:shadow-[0_1px_0_rgba(20,20,20,0.04)]">
        <div className="mt-5 space-y-4 lg:mt-0">
          {mature ? (
            <>
              <Notice>The date has passed. Withdrawing returns the principal{BigInt(lock.matureBonus) > 0n ? " and this lock's share of the bonus pool" : ""}.</Notice>
              <MatureLock id={lock.id} />
            </>
          ) : (
            <>
              <TopUpLock id={lock.id} choices={choices} />
              <Notice>Breaking early pays {labeled(lock.breakPayout, quote)} and leaves {labeled(lock.breakPenalty, quote)} in the bonus pool. Yield already streamed is not clawed back.</Notice>
              <BreakLock id={lock.id} />
            </>
          )}
        </div>
      </div>
      )}
      </div>
    </Page>
  );
}
