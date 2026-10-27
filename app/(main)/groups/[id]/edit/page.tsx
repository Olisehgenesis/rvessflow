import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "../../../loading";
import { EditLiveForm } from "@/components/edit-draft";
import { Page } from "@/components/ui-bits";
import { groupLabel } from "@/lib/circle";
import { loadPortfolio } from "@/lib/protocol";
import { viewer } from "@/lib/session";

export default function EditGroupPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <EditBody params={params} />
    </Suspense>
  );
}

async function EditBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const who = await viewer();
  const [data, label] = await Promise.all([loadPortfolio(who), groupLabel(id).catch(() => null)]);
  const group = data.groups.find((item) => item.id === id);
  if (!group || data.me.address.toLowerCase() !== group.creator.toLowerCase()) notFound();
  return (
    <Page title="Edit group" back={`/groups/${group.id}/settings`}>
      <EditLiveForm id={group.id} name={label?.name || ""} description={label?.description || ""} />
    </Page>
  );
}
