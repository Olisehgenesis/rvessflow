import Link from "next/link";
import { GoalLink } from "@/components/product";
import { Page } from "@/components/ui-bits";
import { goalNotes } from "@/lib/notes";
import { loadIncoming, loadPortfolio, type FlowRow } from "@/lib/protocol";
import { loadPrices } from "@/lib/prices";
import { loadQuote } from "@/lib/rates";
import { viewer } from "@/lib/session";

export async function PlanList({
  kind,
  title,
  back,
  createHref,
  createLabel,
  empty,
  showIncoming = false,
}: {
  kind: FlowRow["kind"];
  title: string;
  back: string;
  createHref: string;
  createLabel: string;
  empty: string;
  showIncoming?: boolean;
}) {
  const who = await viewer();
  const [data, quote, notes, incoming, priced] = await Promise.all([
    loadPortfolio(who),
    loadQuote(),
    goalNotes(who.address),
    showIncoming ? loadIncoming(who.address) : Promise.resolve([]),
    loadPrices(),
  ]);
  const prices = { usdcUsd8: priced.usdcUsd8, ethUsd8: priced.ethUsd8, gdxUsd8: priced.gdxUsd8 };
  const flows = data.flows.filter((flow) => flow.kind === kind);
  const open = flows.filter((flow) => !flow.settled && !flow.paused && !(kind === "saving" && notes[flow.id]?.paused)).length;
  return (
    <Page
      bleed
      title={title}
      back={back}
      action={
        <Link href={createHref} className="inline-flex h-9 items-center rounded-full bg-primary px-3.5 text-sm font-medium text-primary-foreground">
          {createLabel}
        </Link>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        {open + incoming.length === 0 ? "None open" : `${open + incoming.length} open`}
      </p>
      {showIncoming && incoming.length > 0 ? (
        <ul className="mb-3 space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
          {incoming.map((item) => (
            <li key={`${item.vault}-${item.flow.id}`}>
              <GoalLink
                flow={item.flow}
                readAt={data.readAt}
                quote={quote}
                prices={prices}
                caption={`From ${item.from}`}
                href={`/goals/from/${item.vault}/${item.flow.id}`}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {flows.length === 0 && incoming.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-6 lg:flex lg:items-center lg:gap-5 lg:rounded-3xl lg:px-6 lg:py-8">
          <img src={kind === "saving" ? "/marks/saving.png" : kind === "expense" ? "/marks/expense.png" : "/marks/flow.png"} alt="" className="hidden size-20 shrink-0 object-contain lg:block" />
          <div>
          <p className="text-sm text-muted-foreground">{empty}</p>
          <Link href={createHref} className="mt-4 inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground lg:w-fit">
            {createLabel}
          </Link>
          </div>
        </div>
      ) : flows.length > 0 ? (
        <ul className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
          {flows.map((flow) => (
            <li key={flow.id}>
              <GoalLink flow={flow} readAt={data.readAt} quote={quote} prices={prices} appPaused={Boolean(notes[flow.id]?.paused)} />
            </li>
          ))}
        </ul>
      ) : null}
    </Page>
  );
}
