import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "../../../../loading";
import { GroupLead } from "@/components/group-bits";
import { Page } from "@/components/ui-bits";
import { readDraft } from "@/lib/circle";

export default function DraftRulesPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <RulesBody params={params} />
    </Suspense>
  );
}

async function RulesBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const draft = await readDraft(id);
  if (!draft) notFound();
  return (
    <Page title="Group rules" back={`/groups/draft/${draft.id}`}>
      <GroupLead src="/marks/rules.png" title="How this rotation pays" body="The organizer can still change these terms before the group starts." />
      <ul className="divide-y divide-border border-y border-border text-sm leading-relaxed">
        <li className="py-3">Each cycle, every member pays {draft.contribution} USD. A cycle lasts {draft.cycleLabel}.</li>
        <li className="py-3">{draft.plain ? "Each payment goes straight to the person whose turn it is." : "The pot streams to the person whose turn it is."}</li>
        <li className="py-3">Turn 1 receives the first cycle. The organizer can change the order until the rotation starts.</li>
        <li className="py-3">Everyone posts collateral before the rotation can start. Collateral comes back if the group is cancelled before it starts, or when it finishes.</li>
        <li className="py-3">A missed payment is recorded on the member. The window and the grace period are set from the cycle length.</li>
      </ul>
    </Page>
  );
}
