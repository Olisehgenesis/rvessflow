import { Suspense } from "react";
import { LockForm } from "@/components/forms";
import Loading from "../../loading";
import { ProductMark } from "@/components/product";
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
      <div className="mb-4 flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <ProductMark kind="lock" size="sm" />
          <div>
            <p className="font-medium">USDCx</p>
            <p className="text-xs text-muted-foreground">USD Coin (x)</p>
          </div>
        </div>
        <span aria-hidden className="text-muted-foreground">›</span>
      </div>
      <LockForm penalty={data.protocol.penaltyBps} yieldBudget={data.protocol.yieldBudget} />
    </Page>
  );
}
