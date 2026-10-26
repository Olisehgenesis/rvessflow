import { Suspense } from "react";
import Link from "next/link";
import Loading from "../loading";
import { GoalLink, LockLink } from "@/components/product";
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
      title="Plans"
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
                readAt={item.readAt}
                quote={quote}
                caption={`From ${item.from}`}
                href={`/goals/from/${item.vault}/${item.flow.id}`}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {data.flows.length === 0 && incoming.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          A saving holds money still. A flow or expense streams it until the end date.
        </p>
      ) : data.flows.length > 0 ? (
        <ul className="space-y-3">
          {data.flows.map((flow) => (
            <li key={flow.id}>
              <GoalLink flow={flow} readAt={data.readAt} quote={quote} appPaused={Boolean(notes[flow.id]?.paused)} />
            </li>
          ))}
        </ul>
      ) : null}
      <section id="locks" className="mt-8">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="text-base font-semibold">Locks</h2>
          <Link href="/vaults/new" className="text-sm font-medium text-foreground">
            Create lock
          </Link>
        </div>
        {data.locks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No locks yet. A lock holds tokens until a date.</p>
        ) : (
          <ul className="space-y-3">
            {data.locks.map((lock) => (
              <li key={lock.id}>
                <LockLink lock={lock} quote={quote} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  );
}
