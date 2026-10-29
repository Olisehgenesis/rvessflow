import { Suspense } from "react";
import { notFound } from "next/navigation";
import Loading from "../../../loading";
import { DraftDesk } from "@/components/circle";
import { GroupLead, GroupNav } from "@/components/group-bits";
import { GroupUpgradeNote } from "@/components/group-upgrade";
import { Fact, Facts, Page } from "@/components/ui-bits";
import { readDraft } from "@/lib/circle";

export default function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <DraftBody params={params} />
    </Suspense>
  );
}

async function DraftBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const draft = await readDraft(id);
  if (!draft) notFound();
  const base = `/groups/draft/${draft.id}`;
  return (
    <Page title={draft.name} back="/groups">
      <div className="mb-4">
        <GroupUpgradeNote />
      </div>
      <GroupLead src="/marks/group.png" title="Getting ready" body={draft.description || "Add the people, then start the group on-chain."} />
      <Facts>
        <Fact label="Contribution" value={`${draft.contribution} USD`} />
        <Fact label="Cycle" value={draft.cycleLabel} />
        <Fact label="Cycles" value={String(draft.cycles)} />
        <Fact label="Chain" value={draft.networkLabel} />
        <Fact label="Each turn" value={draft.plain ? "Paid as a transfer" : "Streams"} />
      </Facts>
      <GroupNav
        links={[
          { href: base, label: "Members" },
          { href: `${base}/rules`, label: "Rules" },
          { href: `${base}/activity`, label: "Activity" },
          { href: `${base}/invite`, label: "Invite" },
          { href: `${base}/settings`, label: "Settings" },
        ]}
      />
      <DraftDesk draft={draft} />
    </Page>
  );
}
