import { Suspense } from "react";
import Loading from "../../../loading";
import { CryptoDeposit } from "@/components/deposit-flow";
import { loadDepositPage } from "@/lib/deposit-page";

export default function CryptoPage({ searchParams }: { searchParams: Promise<{ pay?: string; usd?: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <CryptoBody searchParams={searchParams} />
    </Suspense>
  );
}

async function CryptoBody({ searchParams }: { searchParams: Promise<{ pay?: string; usd?: string }> }) {
  const params = await searchParams;
  const data = await loadDepositPage(params.pay, params.usd);
  return (
    <CryptoDeposit
      totalUsd={data.totalUsd}
      available={data.available}
      streaming={data.streaming}
      locked={data.locked}
      tokens={data.tokens}
      initialPay={data.pay}
      initialUsd={data.usd}
      initialPreview={data.preview}
      initialError={data.quoteError}
    />
  );
}
