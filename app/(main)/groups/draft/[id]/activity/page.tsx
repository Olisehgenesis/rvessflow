import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "../../../../loading";
import { GroupLead } from "@/components/group-bits";
import { Page } from "@/components/ui-bits";
import { readDraft } from "@/lib/circle";

export default function DraftActivityPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <ActivityBody params={params} />
    </Suspense>
  );
}

async function ActivityBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const draft = await readDraft(id);
  if (!draft) notFound();
  return (
    <Page title="Activity" back={`/groups/draft/${draft.id}`}>
      <GroupLead src="/marks/activity.png" title="Before it is on-chain" body="People and applications. The rotation has not started." />
      <ul className="divide-y divide-border border-y border-border text-sm">
        <li className="py-3">
          <p className="font-medium">{draft.name} was created</p>
          <p className="mt-1 text-xs text-muted-foreground">It is not on-chain until the organizer starts it.</p>
        </li>
        {draft.members.map((member) => (
          <li key={member.address} className="py-3">
            <p className="font-medium">{member.you ? `${member.name} (you)` : member.name} is in the group</p>
            <p className="mt-1 text-xs text-muted-foreground">{member.organizer ? "Organizer" : "Member"}</p>
          </li>
        ))}
        {draft.applications.map((item) => (
          <li key={item.address} className="py-3">
            <p className="font-medium">{item.name} applied</p>
          </li>
        ))}
      </ul>
    </Page>
  );
}
