import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "../../../../loading";
import { GroupNotes } from "@/components/group-notes";
import { Page } from "@/components/ui-bits";
import { readDraft } from "@/lib/circle";

export default function DraftNotesPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <NotesBody params={params} />
    </Suspense>
  );
}

async function NotesBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const draft = await readDraft(id);
  if (!draft) notFound();
  return (
    <Page title="Notifications" back={`/groups/draft/${draft.id}/settings`}>
      <GroupNotes id={draft.id} />
    </Page>
  );
}
