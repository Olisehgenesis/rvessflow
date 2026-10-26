import { Suspense } from "react";
import Link from "next/link";
import Loading from "../loading";
import { GoalLink } from "@/components/product";
import { Page } from "@/components/ui-bits";
import { goalNotes } from "@/lib/notes";
import { loadQuote } from "@/lib/rates";
import { loadIncoming, loadPortfolio } from "@/lib/protocol";
import { viewer } from "@/lib/session";

export default function GoalsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <GoalsBody />
    </Suspense>
  );
}

async function GoalsBody() {
  const who = await viewer();
  const [data, quote, notes, incoming] = await Promise.all([
    loadPortfolio(who),
    loadQuote(),
    goalNotes(who.address),
    loadIncoming(who.address),
  ]);
  const own = data.flows.filter((flow) => !flow.settled && !(flow.kind === "saving" && notes[flow.id]?.paused) && !flow.paused).length;
  const open = own + incoming.filter((item) => !item.flow.paused).length;
  return (
    <Page
      title="Your goals"
      action={
        <Link href="/goals/new" className="inline-flex h-9 items-center rounded-full bg-primary px-3.5 text-sm font-medium text-primary-foreground">
          + Create goal
        </Link>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">{open === 0 ? "No active goals" : `${open} active goal${open === 1 ? "" : "s"}`}</p>
      {incoming.length > 0 ? (
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
      {data.flows.length === 0 && incoming.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-6">
          <p className="text-sm text-muted-foreground">A saving holds money still. A flow or expense streams it until the end date.</p>
          <Link href="/goals/new" className="mt-4 inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
            Create goal
          </Link>
        </div>
      ) : data.flows.length > 0 ? (
        <ul className="space-y-3">
          {data.flows.map((flow) => (
            <li key={flow.id}>
              <GoalLink flow={flow} readAt={data.readAt} quote={quote} appPaused={Boolean(notes[flow.id]?.paused)} />
            </li>
          ))}
        </ul>
      ) : null}
    </Page>
  );
}
