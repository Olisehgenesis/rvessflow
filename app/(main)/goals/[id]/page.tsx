import { Suspense } from "react";
import { notFound } from "next/navigation";
import Loading from "../../loading";
import { AddToGoal, NamedAction, VaultButtons } from "@/components/forms";
import { FlowingAmount, FlowingProgress } from "@/components/flowing";
import { GoalMenu } from "@/components/goal-menu";
import { ProductMark } from "@/components/product";
import { IconCalendar, IconInfo } from "@/components/icons";
import { doVault } from "@/lib/actions";
import { Amount, Notice, Page, when } from "@/components/ui-bits";
import { inferFrequency, isFrequency } from "@/lib/intent";
import { goalNotes } from "@/lib/notes";
import { labeled, percent, show } from "@/lib/display";
import { loadPayChoices } from "@/lib/holdings";
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
  const [data, quote, notes, choices] = await Promise.all([
    loadPortfolio(who),
    loadQuote(),
    goalNotes(who.address),
    loadPayChoices(who.address),
  ]);
  const flow = data.flows.find((item) => item.id === id);
  if (!flow) notFound();
  const note = notes[flow.id];
  const frequency = note?.frequency && isFrequency(note.frequency) ? note.frequency : inferFrequency(flow.duration);
  const description = note?.description ?? "";
  const appPaused = Boolean(note?.paused);
  const now = data.readAt;
  const saving = flow.kind === "saving";
  const paused = flow.paused || appPaused;
  const live = !saving && flow.active && !flow.paused && !flow.settled;
  const whole = saving ? flow.goal : flow.reserved;
  const part = saving ? flow.saved : (BigInt(flow.reserved) - BigInt(flow.remaining)).toString();
  const status = flow.settled ? "Closed" : paused ? "Paused" : flow.active || saving ? "Active" : "Waiting";
  return (
    <Page back="/goals" action={<GoalMenu id={flow.id} description={description} frequency={frequency} saving={saving} />}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <ProductMark kind={flow.kind} size="md" quiet={flow.settled} />
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
          {live ? <FlowingAmount readAt={data.readAt} base={part} perSecond={flow.rate} ceiling={whole} quote={quote} /> : <Amount value={part} quote={quote} />}
          <p className="text-sm text-muted-foreground">of {labeled(whole, quote)}</p>
        </div>
        <p className="text-sm font-medium tabular-nums">{percent(part, whole)}%</p>
      </div>
      {live ? (
        <FlowingProgress readAt={data.readAt} base={part} perSecond={flow.rate} ceiling={whole} whole={whole} />
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
      {flow.settled ? null : (
        <div className="mt-5 space-y-3">
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
                  : `About ${show((BigInt(flow.rate) * 86400n).toString(), quote)} ${quote.unit} moves every 24 hours while this stream is open.`}
              </span>
            </span>
          </Notice>
        </div>
      )}
    </Page>
  );
}
