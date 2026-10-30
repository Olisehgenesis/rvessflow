import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "../../../loading";
import { GroupLead } from "@/components/group-bits";
import { Page } from "@/components/ui-bits";
import { spanLabel } from "@/lib/cycle";
import { labeledGroup } from "@/lib/group-token";
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
      <GroupLead src="/marks/rules.png" title="How this rotation pays" body="These terms are fixed once the group is on-chain." />
      <ul className="divide-y divide-border border-y border-border text-sm leading-relaxed">
        <li className="py-3">Each cycle, every member pays {labeledGroup(group.contribution, group.token)}. A cycle lasts {spanLabel(group.cycleSeconds)}.</li>
        <li className="py-3">There are {spanLabel(group.windowSeconds)} to pay, then {spanLabel(group.graceSeconds)} of grace.</li>
        <li className="py-3">Turn 1 receives the first cycle. The order locks when the rotation starts.</li>
        <li className="py-3">Collateral is {labeledGroup(group.collateral, group.token)}. It comes back if the group is cancelled before it starts, or when the group finishes.</li>
        <li className="py-3">A missed payment stays on the member&apos;s record. Pausing the group is not something the organizer can do.</li>
      </ul>
    </Page>
  );
}
