import { Suspense } from "react";
import Link from "next/link";
import Loading from "../loading";
import { EmptyGroups } from "@/components/group-bits";
import { GroupUpgradeNote } from "@/components/group-upgrade";
import { GroupLink } from "@/components/product";
import { Page } from "@/components/ui-bits";
import { spanLabel } from "@/lib/cycle";
import { allLabels, draftsIfReady } from "@/lib/circle";
import { loadQuote } from "@/lib/rates";
import { loadPortfolio } from "@/lib/protocol";
import { viewer } from "@/lib/session";

export default function GroupsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <GroupsBody searchParams={searchParams} />
    </Suspense>
  );
}

async function GroupsBody({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const joined = tab === "joined";
  const who = await viewer();
  const [data, quote, directory, labels] = await Promise.all([loadPortfolio(who), loadQuote(), draftsIfReady(who.address), allLabels().catch(() => [])]);
  const nameFor = (id: string, fallback: string) => labels.find((item) => item.ref === id)?.name || fallback;
  const drafts = directory.drafts.filter((draft) => (joined ? draft.role === "member" || draft.role === "applied" : draft.role === "organizer"));
  const groups = data.groups.filter((group) => (joined ? group.creator.toLowerCase() !== data.me.address.toLowerCase() : group.creator.toLowerCase() === data.me.address.toLowerCase()));
  const empty = drafts.length === 0 && groups.length === 0;
  return (
    <Page
      title="Groups"
      action={
        <Link href="/groups/join" className="text-sm font-medium text-foreground">
          Join
        </Link>
      }
    >
      <div className="mb-4 flex gap-2">
        <Tab href="/groups" pressed={!joined}>
          My groups
        </Tab>
        <Tab href="/groups?tab=joined" pressed={joined}>
          Joined
        </Tab>
      </div>
      <div className="mb-4">
        <GroupUpgradeNote />
      </div>
      {directory.down ? <p className="mb-4 text-sm text-muted-foreground">The member directory is unavailable, so drafts cannot load. Groups already on Base still show here.</p> : null}
      {empty ? (
        <EmptyGroups joined={joined} />
      ) : (
        <div className="space-y-6">
          {drafts.length > 0 ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold">Getting ready</h2>
              <ul className="space-y-3">
                {drafts.map((draft) => (
                  <li key={draft.id}>
                    <Link href={`/groups/draft/${draft.id}`} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
                      <img src="/marks/group.png" alt="" className="size-12 shrink-0 object-contain" />
                      <span className="min-w-0">
                        <span className="block font-medium">{draft.name}</span>
                        <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
                          {draft.contribution} USD · {draft.cycles} cycles of {draft.cycleLabel}
                          {draft.role === "applied" ? " · Applied" : ""}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {groups.length > 0 ? (
            <ul className="space-y-3">
              {groups.map((group) => (
                <li key={group.id}>
                  <GroupLink
                    id={group.id}
                    status={group.finalized ? "Finished" : group.started ? "Active" : group.cancelled ? "Cancelled" : "Not started"}
                    contribution={group.contribution}
                    members={group.members.length}
                    title={nameFor(group.id, `Group ${group.id}`)}
                    detail={`${group.cycles} cycles, ${spanLabel(group.cycleSeconds)} each.`}
                    quote={quote}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          <Link href="/groups/new" className="inline-flex h-12 w-full items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
            Create group
          </Link>
        </div>
      )}
    </Page>
  );
}

function Tab({ href, pressed, children }: { href: string; pressed: boolean; children: string }) {
  return (
    <Link href={href} aria-current={pressed ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-medium ${pressed ? "bg-foreground text-background" : "border border-border"}`}>
      {children}
    </Link>
  );
}
