import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "../../../../loading";
import { EditDraftForm } from "@/components/edit-draft";
import { Page } from "@/components/ui-bits";
import { readDraft } from "@/lib/circle";
import { groupPlainOn } from "@/lib/group-site";

export default function EditDraftPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <EditBody params={params} />
    </Suspense>
  );
}

async function EditBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const draft = await readDraft(id);
  if (!draft || !draft.mine) notFound();
  const status = await groupPlainOn(draft.network);
  return (
    <Page title="Edit group" back={`/groups/draft/${draft.id}/settings`}>
      <EditDraftForm draft={draft} live={status.live} />
    </Page>
  );
}
