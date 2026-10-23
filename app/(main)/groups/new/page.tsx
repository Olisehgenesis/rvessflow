import { Suspense } from "react";
import { GroupForm } from "@/components/forms";
import Loading from "../../loading";
import { KindIntro } from "@/components/product";
import { Page } from "@/components/ui-bits";
import { loadPortfolio } from "@/lib/protocol";
import { viewer } from "@/lib/session";

export default function NewGroupPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NewGroupBody />
    </Suspense>
  );
}

async function NewGroupBody() {
  const data = await loadPortfolio(await viewer());
  return (
    <Page title="New group" back="/groups">
      <KindIntro kind="group" />
      <GroupForm people={data.people} me={data.me.address} />
    </Page>
  );
}
