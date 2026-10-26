import { Suspense } from "react";
import Link from "next/link";
import Loading from "../loading";
import { ApplyLink } from "@/components/circle";
import { GroupLink, ProductMark } from "@/components/product";
import { Page } from "@/components/ui-bits";
import { spanLabel } from "@/lib/cycle";
import { draftsIfReady } from "@/lib/circle";
import { loadQuote } from "@/lib/rates";
import { loadPortfolio } from "@/lib/protocol";
import { viewer } from "@/lib/session";

export default function GroupsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <GroupsBody />
    </Suspense>
  );
}

async function GroupsBody() {
  const who = await viewer();
  const [data, quote, directory] = await Promise.all([loadPortfolio(who), loadQuote(), draftsIfReady(who.address)]);
  const drafts = directory.drafts;
  return (
    <Page
      title="Groups"
      action={
        <Link href="/groups/new" className="text-sm font-medium text-foreground">
          New group
        </Link>
      }
    >
      {directory.down ? <p className="mb-4 text-sm text-muted-foreground">The member directory is unavailable, so drafts cannot load. Groups already on Base still show here.</p> : null}
      {drafts.length === 0 && data.groups.length === 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <ProductMark kind="group" size="lg" />
            <h2 className="text-lg font-semibold">A rotating pot</h2>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Create a group, add people by the email, phone, or password linked to their wallet, arrange the order, then start it. People can also apply to join.
          </p>
          <Link href="/groups/new" className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
            Start a group
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {drafts.length > 0 ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold">Getting ready</h2>
              <ul className="divide-y divide-border border-y border-border">
                {drafts.map((draft) => (
                  <li key={draft.id} className="py-3 text-sm">
                    <p className="font-medium">
                      {draft.contribution} USD · {draft.cycles} cycles of {draft.cycleLabel}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {draft.count} {draft.count === 1 ? "member" : "members"}
                      {draft.role === "organizer" ? " · You organize this" : ""}
                      {draft.role === "member" ? " · You are in" : ""}
                      {draft.role === "applied" ? " · Applied" : ""}
                      {draft.role === "open" ? " · Open to apply" : ""}
                    </p>
                    <div className="mt-2">
                      {draft.role === "open" ? (
                        <ApplyLink id={draft.id} />
                      ) : (
                        <Link href={`/groups/draft/${draft.id}`} className="text-sm font-medium text-foreground">
                          {draft.role === "organizer" ? "Arrange members" : "View group"}
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {data.groups.length > 0 ? (
            <ul className="space-y-3">
              {data.groups.map((group) => (
                <li key={group.id}>
                  <GroupLink
                    id={group.id}
                    status={group.finalized ? "Finished" : group.started ? "Active" : group.cancelled ? "Cancelled" : "Not started"}
                    contribution={group.contribution}
                    members={group.members.length}
                    detail={`${group.cycles} cycles, ${spanLabel(group.cycleSeconds)} each. Created by ${group.creatorName}.`}
                    quote={quote}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </Page>
  );
}
