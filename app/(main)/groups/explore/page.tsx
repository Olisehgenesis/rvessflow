import { Suspense } from "react";
import Link from "next/link";
import Loading from "../../loading";
import { ApplyLink } from "@/components/circle";
import { Page } from "@/components/ui-bits";
import { draftsIfReady } from "@/lib/circle";
import { viewer } from "@/lib/session";

export default function ExplorePage() {
  return (
    <Suspense fallback={<Loading />}>
      <ExploreBody />
    </Suspense>
  );
}

async function ExploreBody() {
  const who = await viewer();
  const directory = await draftsIfReady(who.address);
  const open = directory.drafts.filter((draft) => draft.role === "open");
  return (
    <Page title="Explore groups" back="/groups">
      {open.length === 0 ? (
        <div className="py-2">
          <div className="mb-4 flex items-center gap-3">
            <img src="/marks/explore.png" alt="" className="size-12 shrink-0 object-contain" />
            <div>
              <h2 className="text-sm font-medium">No groups are open</h2>
              <p className="text-sm leading-snug text-muted-foreground">Ask an organizer for a code, or create your own group.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Link href="/groups/join" className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
              Join with a code
            </Link>
            <Link href="/groups/new" className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-card px-5 text-sm font-medium">
              Create group
            </Link>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {open.map((draft) => (
            <li key={draft.id} className="py-3 text-sm">
              <p className="font-medium">{draft.name}</p>
              {draft.description ? <p className="mt-1 text-muted-foreground">{draft.description}</p> : null}
              <p className="mt-1 text-xs text-muted-foreground">
                {draft.contribution} {draft.token === "gdx" ? "G$" : "USD"} · {draft.cycles} cycles of {draft.cycleLabel} · {draft.count} {draft.count === 1 ? "member" : "members"}
              </p>
              <div className="mt-2">
                <ApplyLink id={draft.id} />
              </div>
              <Link href={`/groups/draft/${draft.id}`} className="mt-2 inline-block text-sm font-medium">
                View group
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
