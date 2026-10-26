import { Suspense } from "react";
import Loading from "../../../loading";
import { DepositStatus } from "@/components/deposit-flow";
import { loadDepositPage } from "@/lib/deposit-page";

export default function StatusPage({ searchParams }: { searchParams: Promise<{ pay?: string; usd?: string; hash?: string; done?: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <StatusBody searchParams={searchParams} />
    </Suspense>
  );
}

async function StatusBody({ searchParams }: { searchParams: Promise<{ pay?: string; usd?: string; hash?: string; done?: string }> }) {
  const params = await searchParams;
  const data = await loadDepositPage(params.pay, params.usd);
  const hash = params.hash && /^0x[0-9a-fA-F]{64}$/.test(params.hash) ? params.hash : "";
  return <DepositStatus hash={hash} done={params.done === "1"} usd={data.usd} preview={data.preview} />;
}
