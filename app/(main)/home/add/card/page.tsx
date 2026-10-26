import { Suspense } from "react";
import Loading from "../../../loading";
import { FlowHeader } from "@/components/deposit-flow";
import { CardOnramps } from "@/components/funding-methods";
import { coinbaseStatus, transakStatus } from "@/lib/onramp";

export default function CardPage() {
  return (
    <Suspense fallback={<Loading />}>
      <CardBody />
    </Suspense>
  );
}

async function CardBody() {
  return (
    <main className="px-4 pt-4 pb-8">
      <FlowHeader title="Buy with card" back="/home/add" />
      <p className="mb-4 text-sm text-muted-foreground">Both onramps target your Base address and USDC. Keys stay on the server.</p>
      <CardOnramps transak={transakStatus(process.env)} coinbase={coinbaseStatus(process.env)} />
    </main>
  );
}
