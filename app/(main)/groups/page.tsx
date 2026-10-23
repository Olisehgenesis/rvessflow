import { Suspense } from "react";
import Link from "next/link";
import Loading from "../loading";
import { GroupLink, ProductMark } from "@/components/product";
import { Page } from "@/components/ui-bits";
import { spanLabel } from "@/lib/cycle";
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
  const [data, quote] = await Promise.all([loadPortfolio(who), loadQuote()]);
  return (
    <Page
      title="Groups"
      action={
        <Link href="/groups/new" className="text-sm font-medium text-foreground">
          New group
        </Link>
      }
    >
      {data.groups.length === 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <ProductMark kind="group" size="lg" />
            <h2 className="text-lg font-semibold">A rotating pot</h2>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Three or more of the funded accounts can take turns. Everyone posts collateral first. The pot is a real Superfluid distribution.
          </p>
          <Link href="/groups/new" className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
            Start a group
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border">
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
      )}
    </Page>
  );
}
