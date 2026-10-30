import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import Loading from "../../loading";
import { GroupButton } from "@/components/forms";
import { GroupLead, GroupNav, GroupRotationPlan } from "@/components/group-bits";
import { Fact, Facts, Page } from "@/components/ui-bits";
import { spanLabel } from "@/lib/cycle";
import { liveRotationPlan } from "@/lib/group-plan";
import { labeledGroup } from "@/lib/group-token";
import { groupLabel } from "@/lib/circle";
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
  const [data, label] = await Promise.all([loadPortfolio(who), groupLabel(id).catch(() => null)]);
  const group = data.groups.find((item) => item.id === id);
  if (!group) notFound();
  const me = group.members.find((member) => member.account.toLowerCase() === data.me.address.toLowerCase());
  const allPosted = group.members.every((member) => member.posted);
  const mine = data.me.address.toLowerCase() === group.creator.toLowerCase();
  const status = group.finalized ? "Finished" : group.started ? "Active" : group.cancelled ? "Cancelled" : "Not started";
  const base = `/groups/${group.id}`;
  const plan = liveRotationPlan({
    contributionWei: group.contribution,
    token: group.token,
    cycles: group.cycles,
    cycleSeconds: group.cycleSeconds,
    members: group.members.map((member) => ({
      name: member.name,
      you: member.account.toLowerCase() === data.me.address.toLowerCase(),
    })),
  });
  const payLabel =
    !group.started && !group.cancelled && me && !me.posted
      ? `Post ${labeledGroup(group.collateral, group.token)}`
      : group.started && group.cycleOpen
        ? `Pay ${labeledGroup(group.contribution, group.token)}`
        : "";
  return (
    <Page title={label?.name || `Group ${group.id}`} back="/groups">
      <div className="contents lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] lg:items-start lg:gap-6">
      <div className="lg:rounded-3xl lg:border lg:border-[#E6EADF] lg:bg-white lg:p-6 lg:shadow-[0_1px_0_rgba(20,20,20,0.04)]">
      <GroupLead
        src="/marks/group.png"
        title={status}
        body={label?.description || `${group.members.length} members. Created by ${group.creatorName}.`}
      />
      <Facts>
        <Fact label="Contribution" value={labeledGroup(group.contribution, group.token)} />
        <Fact label="Cycle" value={spanLabel(group.cycleSeconds)} />
        <Fact label="Cycles" value={String(group.cycles)} />
        <Fact label="Organizer" value={group.creatorName} />
      </Facts>
      {!group.started && !group.cancelled ? (
        <div className="mt-4">
          <GroupRotationPlan
            youPost={plan.youPost}
            othersCount={plan.othersCount}
            othersPost={plan.othersPost}
            eachTurn={plan.eachTurn}
            turns={plan.turns}
          />
        </div>
      ) : null}
      </div>
      <div className="lg:rounded-3xl lg:border lg:border-[#E6EADF] lg:bg-white lg:p-6 lg:shadow-[0_1px_0_rgba(20,20,20,0.04)]">
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
      </div>
      </div>
    </Page>
  );
}
