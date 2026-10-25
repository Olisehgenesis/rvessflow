import { Suspense } from "react";
import { notFound } from "next/navigation";
import Loading from "../../loading";
import { AddFunds, NamedAction, ReleaseFunds, VaultButtons } from "@/components/forms";
import { doVault } from "@/lib/actions";
import { FlowingAmount, FlowingProgress, FlowingText } from "@/components/flowing";
import { ProductMark } from "@/components/product";
import { Amount, Fact, Facts, Notice, Page, durationLabel, when } from "@/components/ui-bits";
import { labeled, percent, show } from "@/lib/display";
import { loadQuote } from "@/lib/rates";
import { loadPortfolio } from "@/lib/protocol";
import { viewer } from "@/lib/session";
import { Progress } from "@/components/ui/progress";

export default function GoalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fresh?: string }>;
}) {
  return (
    <Suspense fallback={<Loading />}>
      <GoalBody params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function GoalBody({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fresh?: string }>;
}) {
  const { id } = await params;
  const fresh = (await searchParams).fresh === "1";
  const who = await viewer();
  const [data, quote] = await Promise.all([loadPortfolio(who), loadQuote()]);
  const flow = data.flows.find((item) => item.id === id);
  if (!flow) notFound();
  const now = Math.floor(Date.now() / 1000);
  const saving = flow.kind === "saving";
  const live = !saving && flow.active && !flow.paused && !flow.settled;
  const whole = saving ? flow.goal : flow.reserved;
  const part = saving ? flow.saved : (BigInt(flow.reserved) - BigInt(flow.remaining)).toString();
  const status = flow.settled ? "Closed" : flow.paused ? "Paused" : saving && flow.active ? "Holding" : flow.active ? "Streaming" : "Waiting to start";
  return (
    <Page title={flow.name} back="/goals" action={<span className="rounded-full bg-foreground px-2.5 py-1 text-[11px] font-medium text-background">{status}</span>}>
      <div className="mb-4 flex items-center gap-3">
        <ProductMark kind={flow.kind} size="md" quiet={flow.settled} />
        <div>
          <p className="font-medium">{saving ? "Saving" : flow.kind === "expense" ? "Expense" : "Flow"}</p>
          <p className="text-sm text-muted-foreground">
            {fresh && saving
              ? "The money is holding. Nothing is streaming."
              : fresh
                ? "The stream is open."
                : flow.kind === "expense"
                  ? `To ${flow.recipientName}`
                  : "USDCx"}
          </p>
        </div>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          {live ? <FlowingAmount readAt={data.readAt} base={part} perSecond={flow.rate} ceiling={whole} quote={quote} /> : <Amount value={part} quote={quote} />}
          <p className="text-sm text-muted-foreground">of {labeled(whole, quote)}</p>
        </div>
        <p className="text-sm font-medium tabular-nums">{percent(part, whole)}%</p>
      </div>
      {live ? (
        <p className="text-sm text-muted-foreground">{show((BigInt(flow.rate) * 86400n).toString(), quote)} every 24 hours.</p>
      ) : null}
      {live ? (
        <FlowingProgress readAt={data.readAt} base={part} perSecond={flow.rate} ceiling={whole} whole={whole} />
      ) : (
        <Progress value={percent(part, whole)} className="mt-4 h-2" />
      )}
      <div className="mt-5">
        <Facts>
          <Fact label="Kind" value={saving ? "Saving goal" : flow.kind === "expense" ? "Expense" : "Flow goal"} />
          <Fact label="To" value={flow.recipientName} />
          <Fact label="Length" value={durationLabel(flow.duration)} />
          <Fact label={flow.end ? "Ends" : "Starts"} value={when(flow.end || flow.earliestStart)} />
          {!saving ? (
            <Fact
              label="Still to stream"
              value={
                live ? (
                  <>
                    <FlowingText readAt={data.readAt} base={flow.remaining} perSecond={`-${flow.rate}`} floor="0" fine quote={quote} /> {quote.unit}
                  </>
                ) : (
                  labeled(flow.remaining, quote)
                )
              }
            />
          ) : null}
        </Facts>
      </div>
      <div className="mt-4">
        {saving ? <Notice>This is a hold. The USDCx stays in your vault and no stream is open. You can add more, or move some back to idle.</Notice> : <Notice>This is a real Superfluid stream. If nobody pauses or settles it, the one-hour cushion is the time left to close it before liquidation.</Notice>}
      </div>
      {flow.settled ? null : (
        <div className="mt-5 space-y-5">
          {saving ? (
            <>
              <AddFunds id={flow.id} />
              <ReleaseFunds id={flow.id} />
            </>
          ) : null}
          {saving && flow.active && now >= flow.end ? <NamedAction id={flow.id} fn="settle" action={doVault} label="Date reached — return the hold to idle" /> : null}
          {!saving ? <VaultButtons id={flow.id} paused={flow.paused} canSettle={flow.active && now >= flow.end} /> : null}
        </div>
      )}
    </Page>
  );
}
