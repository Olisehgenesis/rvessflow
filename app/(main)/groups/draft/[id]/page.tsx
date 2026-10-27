import { Suspense } from "react";
import { notFound } from "next/navigation";
import Loading from "../../../loading";
import { DraftDesk } from "@/components/circle";
import { GroupUpgradeNote } from "@/components/group-upgrade";
import { Page } from "@/components/ui-bits";
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
  return (
    <Page title="Group" back="/groups">
      <div className="mb-4">
        <GroupUpgradeNote />
      </div>
      <DraftDesk draft={draft} />
    </Page>
  );
}
