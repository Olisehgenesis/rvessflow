import { Suspense } from "react";
import Loading from "../../loading";
import { FlowHeader } from "@/components/deposit-flow";
import { TopUpList } from "@/components/withdraw-sheet";
import { networkName } from "@/lib/protocol";

export default function AddMoneyPage() {
  return (
    <Suspense fallback={<Loading />}>
      <main className="px-4 pt-4 pb-8">
        <FlowHeader title="Top up" back="/home" />
        <p className="mb-4 text-sm text-muted-foreground">Choose how money comes in.</p>
        <TopUpList network={networkName} />
      </main>
    </Suspense>
  );
}
