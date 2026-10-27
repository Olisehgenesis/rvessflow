import { Suspense } from "react";
import Loading from "../../../loading";
import { FlowHeader } from "@/components/deposit-flow";
import { MobileMoneyForm } from "@/components/funding-methods";
import { kotaniStatus } from "@/lib/onramp";
import { viewer } from "@/lib/session";

export default function MobilePage() {
  return (
    <Suspense fallback={<Loading />}>
      <MobileBody />
    </Suspense>
  );
}

async function MobileBody() {
  const who = await viewer();
  return (
    <main className="px-4 pb-8">
      <FlowHeader title="Mobile money" back="/home/add" />
      <p className="mb-4 text-sm text-muted-foreground">Uganda. MTN MoMo and Airtel Money through Kotani Pay, which delivers USDC on Base.</p>
      <MobileMoneyForm status={kotaniStatus(process.env)} address={who.address} />
    </main>
  );
}
