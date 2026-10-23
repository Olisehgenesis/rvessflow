import { Suspense } from "react";
import { LockForm } from "@/components/forms";
import Loading from "../../loading";
import { KindIntro } from "@/components/product";
import { Page } from "@/components/ui-bits";
import { loadPortfolio } from "@/lib/protocol";
import { viewer } from "@/lib/session";

export default function NewLockPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NewLockBody />
    </Suspense>
  );
}

async function NewLockBody() {
  const data = await loadPortfolio(await viewer());
  return (
    <Page title="Create lock" back="/vaults">
      <KindIntro kind="lock" />
      <LockForm penalty={data.protocol.penaltyBps} yieldBudget={data.protocol.yieldBudget} />
    </Page>
  );
}
