import { Suspense } from "react";
import Loading from "../../../loading";
import { GroupNotes } from "@/components/group-notes";
import { Page } from "@/components/ui-bits";

export default function NotesPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <NotesBody params={params} />
    </Suspense>
  );
}

async function NotesBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Page title="Notifications" back={`/groups/${id}/settings`}>
      <GroupNotes id={id} />
    </Page>
  );
}
