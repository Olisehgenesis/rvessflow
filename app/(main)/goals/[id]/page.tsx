import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import Loading from "../../loading";
import { AddToGoal, NamedAction, VaultButtons } from "@/components/forms";
import { AutoRefresh } from "@/components/auto-refresh";
import { FlowingAmount, FlowingProgress } from "@/components/flowing";
import { GoalMenu } from "@/components/goal-menu";
import { ProductMark } from "@/components/product";
import { RetryButton } from "@/components/retry-button";
import { IconCalendar, IconInfo } from "@/components/icons";
import { doVault } from "@/lib/actions";
import { Amount, Notice, Page, when } from "@/components/ui-bits";
import { inferFrequency, isFrequency } from "@/lib/intent";
import { goalNotes } from "@/lib/notes";
import { labeled, percent, show } from "@/lib/display";
import { tokenUsdWei } from "@/lib/flow-value";
import { sameGroupKey } from "@/lib/group-network";
import { loadPayChoices } from "@/lib/holdings";
import { loadPrices } from "@/lib/prices";
import { chainQuote } from "@/lib/quote";
import { loadQuote } from "@/lib/rates";
import { loadFlow, loadPortfolio } from "@/lib/protocol";
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
  const [data, quote, notes, choices, priced] = await Promise.all([
    loadPortfolio(who),
    loadQuote(),
    goalNotes(who.address),
    loadPayChoices(who.address),
    loadPrices(),
  ]);
  const flow = data.flows.find((item) => sameGroupKey(item.id, id)) ?? (await loadFlow(who.address, id).catch(() => null));
  if (!flow) {
    if (fresh) {
      return (
        <Page title="Opening on Celo" back="/goals/flow">
          <AutoRefresh />
          <p className="text-sm leading-relaxed text-muted-foreground">
            This stream is on Celo. The vault can take a few seconds to show it after you sign.
          </p>
          <RetryButton label="Check again" />
          <Link href="/goals/flow" className="mt-3 flex h-11 items-center justify-center rounded-full border border-border text-sm font-medium">
            See all streams
          </Link>
        </Page>
      );
    }
    notFound();
  }
  const note = notes[flow.id];
  const frequency = note?.frequency && isFrequency(note.frequency) ? note.frequency : inferFrequency(flow.duration);
  const description = note?.description ?? "";
  const appPaused = Boolean(note?.paused);
  const now = data.readAt;
  const saving = flow.kind === "saving";
  const paused = flow.paused || appPaused;
  const live = !saving && flow.active && !flow.paused && !flow.settled;
  const tokenWhole = saving ? flow.goal : flow.reserved;
  const tokenPart = saving ? flow.saved : (BigInt(flow.reserved) - BigInt(flow.remaining)).toString();
  const px = { usdcUsd8: priced.usdcUsd8, ethUsd8: priced.ethUsd8, gdxUsd8: priced.gdxUsd8 };
  const whole = tokenUsdWei(BigInt(tokenWhole), flow.token, px).toString();
  const part = tokenUsdWei(BigInt(tokenPart), flow.token, px).toString();
  const rate = tokenUsdWei(BigInt(flow.rate), flow.token, px).toString();
  const status = flow.settled ? "Closed" : paused ? "Paused" : flow.active || saving ? "Active" : "Waiting";
  const local = quote.code !== "usd" && quote.code !== "fusdcx";
  return (
    <Page title={flow.name} back={saving ? "/goals/savings" : flow.kind === "expense" ? "/goals/expense/stream" : "/goals/flow"} action={<GoalMenu id={flow.id} description={description} frequency={frequency} saving={saving} />}>
      <div className="contents lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] lg:items-start lg:gap-6">
      <div className="lg:rounded-3xl lg:border lg:border-[#E6EADF] lg:bg-white lg:p-6 lg:shadow-[0_1px_0_rgba(20,20,20,0.04)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <ProductMark kind={flow.kind} size="md" quiet={flow.settled} token={flow.token} />
          <div>
            <p className="font-medium">{flow.name}</p>
            <p className="text-sm text-muted-foreground">{saving ? "Saving" : flow.kind === "expense" ? "Expense" : "Flow"}</p>
          </div>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium">{status}</span>
      </div>
      {fresh ? (
        <p className="mb-3 text-sm text-muted-foreground">{saving ? "The money is holding. Nothing is streaming." : "The stream is open."}</p>
      ) : null}
      <div className="flex items-end justify-between gap-3">
        <div>
          {live ? <FlowingAmount readAt={data.readAt} base={part} perSecond={rate} ceiling={whole} quote={quote} /> : <Amount value={part} quote={quote} />}
          <p className="text-sm text-muted-foreground">of {labeled(whole, quote)}{local ? ` · $${show(part, chainQuote(), 2)}` : ""}</p>
        </div>
        <p className="text-sm font-medium tabular-nums">{percent(part, whole)}%</p>
      </div>
      {live ? (
        <FlowingProgress readAt={data.readAt} base={part} perSecond={rate} ceiling={whole} whole={whole} />
      ) : (
        <Progress value={percent(part, whole)} className="mt-4 h-2" />
      )}
      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          <IconCalendar className="size-4" />
          Ends · {when(flow.end || flow.earliestStart)}
        </span>
        <span className="font-medium">+ {frequency}</span>
      </div>
      <section className="mt-6">
        <h2 className="text-sm font-semibold">About this goal</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {description || "Add a short note from the menu so you remember what this goal is for."}
        </p>
      </section>
      </div>
      {flow.settled ? null : (
      <div className="lg:rounded-3xl lg:border lg:border-[#E6EADF] lg:bg-white lg:p-6 lg:shadow-[0_1px_0_rgba(20,20,20,0.04)]">
        <div className="mt-5 space-y-3 lg:mt-0">
          {saving ? <AddToGoal id={flow.id} choices={choices} /> : null}
          {saving ? (
            appPaused ? (
              <NamedAction id={flow.id} fn="resume" action={doVault} label="Resume goal" />
            ) : (
              <NamedAction id={flow.id} fn="pause" action={doVault} label="Pause goal" tone="quiet" />
            )
          ) : (
            <VaultButtons id={flow.id} paused={flow.paused} canSettle={flow.active && now >= flow.end} />
          )}
          {saving && flow.active && now >= flow.end ? <NamedAction id={flow.id} fn="settle" action={doVault} label="Date reached — return the hold to idle" /> : null}
          <Notice>
            <span className="flex gap-2">
              <IconInfo className="mt-0.5 size-4 shrink-0" />
              <span>
                {saving
                  ? appPaused
                    ? "This goal is paused, so new deposits wait here. The USD already held stays in your vault until you resume."
                    : "You can add more funds or pause this goal at any time."
                  : `About ${show((BigInt(rate) * 86400n).toString(), quote)} ${quote.unit} moves every 24 hours while this stream is open.`}
              </span>
            </span>
          </Notice>
        </div>
      </div>
      )}
      </div>
    </Page>
  );
}
