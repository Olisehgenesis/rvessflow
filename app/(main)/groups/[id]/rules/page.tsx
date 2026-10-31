import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "../../../loading";
import { GroupLead, GroupNav } from "@/components/group-bits";
import { Page } from "@/components/ui-bits";
import { spanLabel } from "@/lib/cycle";
import { weiTimes } from "@/lib/group-plan";
import { labeledGroup } from "@/lib/group-token";
import { liveGroupTabs } from "@/lib/group-ui";
import { loadPortfolio } from "@/lib/protocol";
import { viewer } from "@/lib/session";

export default function RulesPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <RulesBody params={params} />
    </Suspense>
  );
}

async function RulesBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const who = await viewer();
  const data = await loadPortfolio(who);
  const group = data.groups.find((item) => item.id === id);
  if (!group) notFound();
  return (
    <Page title="Group rules" back={`/groups/${group.id}`}>
      <GroupNav current={`/groups/${group.id}/rules`} links={liveGroupTabs(group.id)} />
      <GroupLead src="/marks/rules.png" title="How this rotation pays" body="These terms are fixed once the group is on-chain." />
      <ul className="divide-y divide-border border-y border-border text-sm leading-relaxed">
        <li className="py-3">Each cycle, every member pays {labeledGroup(group.contribution, group.token)}. A cycle lasts {spanLabel(group.cycleSeconds)}.</li>
        <li className="py-3">There are {spanLabel(group.windowSeconds)} to pay, then {spanLabel(group.graceSeconds)} of grace.</li>
        <li className="py-3">Turn 1 receives the first cycle. The order locks when the rotation starts.</li>
        <li className="py-3">Before it starts, each member posts {labeledGroup(group.collateral, group.token)} — their contribution for every turn. Each turn, the person whose turn it is receives {labeledGroup(weiTimes(group.contribution, group.members.length), group.token)}. Posted money comes back if the group is cancelled before it starts, or when it finishes.</li>
        <li className="py-3">A missed payment stays on the member&apos;s record. Pausing the group is not something the organizer can do.</li>
      </ul>
    </Page>
  );
}
