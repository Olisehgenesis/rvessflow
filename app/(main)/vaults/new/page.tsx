import { Suspense } from "react";
import { LockForm } from "@/components/forms";
import Loading from "../../loading";
import { Page } from "@/components/ui-bits";
import { loadQuote } from "@/lib/rates";
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
  const who = await viewer();
  const [data, quote] = await Promise.all([loadPortfolio(who), loadQuote()]);
  return (
    <Page title="Create lock" back="/vaults">
      <LockForm penalty={data.protocol.penaltyBps} quote={quote} />
    </Page>
  );
}
