import Link from "next/link";
import { GoalLink } from "@/components/product";
import { Page } from "@/components/ui-bits";
import { goalNotes } from "@/lib/notes";
import { loadIncoming, loadPortfolio, type FlowRow } from "@/lib/protocol";
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
  const [data, quote, notes, incoming] = await Promise.all([
    loadPortfolio(who),
    loadQuote(),
    goalNotes(who.address),
    showIncoming ? loadIncoming(who.address) : Promise.resolve([]),
  ]);
  const flows = data.flows.filter((flow) => flow.kind === kind);
  const open = flows.filter((flow) => !flow.settled && !flow.paused && !(kind === "saving" && notes[flow.id]?.paused)).length;
  return (
    <Page
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
        <ul className="mb-3 space-y-3">
          {incoming.map((item) => (
            <li key={`${item.vault}-${item.flow.id}`}>
              <GoalLink
                flow={item.flow}
                readAt={data.readAt}
                quote={quote}
                caption={`From ${item.from}`}
                href={`/goals/from/${item.vault}/${item.flow.id}`}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {flows.length === 0 && incoming.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-6">
          <p className="text-sm text-muted-foreground">{empty}</p>
          <Link href={createHref} className="mt-4 inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
            {createLabel}
          </Link>
        </div>
      ) : flows.length > 0 ? (
        <ul className="space-y-3">
          {flows.map((flow) => (
            <li key={flow.id}>
              <GoalLink flow={flow} readAt={data.readAt} quote={quote} appPaused={Boolean(notes[flow.id]?.paused)} />
            </li>
          ))}
        </ul>
      ) : null}
    </Page>
  );
}
