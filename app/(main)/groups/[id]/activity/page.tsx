import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "../../../loading";
import { GroupLead } from "@/components/group-bits";
import { Page } from "@/components/ui-bits";
import { labeledGroup } from "@/lib/group-token";
import { loadPortfolio } from "@/lib/protocol";
import { viewer } from "@/lib/session";

export default function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <ActivityBody params={params} />
    </Suspense>
  );
}

async function ActivityBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const who = await viewer();
  const data = await loadPortfolio(who);
  const group = data.groups.find((item) => item.id === id);
  if (!group) notFound();
  return (
    <Page title="Activity" back={`/groups/${group.id}`}>
      <GroupLead src="/marks/activity.png" title="What the contract shows" body="Posted contributions, payments, and misses. No times are invented." />
      <ul className="divide-y divide-border border-y border-border text-sm">
        <li className="py-3">
          <p className="font-medium">Group {group.started ? "started" : group.cancelled ? "cancelled" : "created"}</p>
          <p className="mt-1 text-xs text-muted-foreground">Created by {group.creatorName}</p>
        </li>
        {group.members.map((member) => (
          <li key={member.account} className="py-3">
            <p className="font-medium">{member.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {member.posted ? `${labeledGroup(group.collateral, group.token)} posted` : `Needs to post ${labeledGroup(group.collateral, group.token)}`}
              {` · Given ${labeledGroup(member.given, group.token)} · Received ${labeledGroup(member.received, group.token)}`}
              {member.missed ? ` · Missed ${member.missed}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </Page>
  );
}
