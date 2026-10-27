import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import Loading from "../../loading";
import { GroupButton } from "@/components/forms";
import { GroupLead, GroupNav } from "@/components/group-bits";
import { GroupUpgradeNote } from "@/components/group-upgrade";
import { Fact, Facts, Page } from "@/components/ui-bits";
import { spanLabel } from "@/lib/cycle";
import { labeled } from "@/lib/display";
import { groupLabel } from "@/lib/circle";
import { loadQuote } from "@/lib/rates";
import { loadPortfolio } from "@/lib/protocol";
import { viewer } from "@/lib/session";

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <GroupBody params={params} />
    </Suspense>
  );
}

async function GroupBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const who = await viewer();
  const [data, quote, label] = await Promise.all([loadPortfolio(who), loadQuote(), groupLabel(id).catch(() => null)]);
  const group = data.groups.find((item) => item.id === id);
  if (!group) notFound();
  const me = group.members.find((member) => member.account.toLowerCase() === data.me.address.toLowerCase());
  const allPosted = group.members.every((member) => member.posted);
  const mine = data.me.address.toLowerCase() === group.creator.toLowerCase();
  const status = group.finalized ? "Finished" : group.started ? "Active" : group.cancelled ? "Cancelled" : "Not started";
  const base = `/groups/${group.id}`;
  const payLabel = !group.started && !group.cancelled && me && !me.posted ? "Post collateral" : group.started && group.cycleOpen ? "Pay this cycle" : "";
  return (
    <Page title={label?.name || `Group ${group.id}`} back="/groups">
      <div className="mb-4">
        <GroupUpgradeNote />
      </div>
      <GroupLead
        src="/marks/group.png"
        title={status}
        body={label?.description || `${group.members.length} members. Created by ${group.creatorName}.`}
      />
      <Facts>
        <Fact label="Contribution" value={labeled(group.contribution, quote)} />
        <Fact label="Cycle" value={spanLabel(group.cycleSeconds)} />
        <Fact label="Cycles" value={String(group.cycles)} />
        <Fact label="Organizer" value={group.creatorName} />
      </Facts>
      <GroupNav
        links={[
          { href: `${base}/members`, label: "Members" },
          { href: `${base}/rules`, label: "Rules" },
          { href: `${base}/activity`, label: "Activity" },
          { href: `${base}/invite`, label: "Invite" },
          { href: `${base}/settings`, label: "Settings" },
        ]}
      />
      <div className="mt-4 space-y-3">
        {payLabel ? (
          <Link href={`${base}/pay`} className="inline-flex h-12 w-full items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
            {payLabel}
          </Link>
        ) : null}
        {!group.started && !group.cancelled && allPosted && mine ? <GroupButton id={group.id} fn="start" label="Start the rotation" /> : null}
        {group.started && !group.cycleOpen && !group.finalized ? <p className="text-sm text-muted-foreground">This cycle is not open for payment yet.</p> : null}
      </div>
    </Page>
  );
}
