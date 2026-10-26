import { redirect } from "next/navigation";
import { Suspense } from "react";
import Loading from "../../../loading";
import { TokenSelect } from "@/components/deposit-flow";
import { loadDepositPage } from "@/lib/deposit-page";

export default function TokenPage({ searchParams }: { searchParams: Promise<{ pay?: string; usd?: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <TokenBody searchParams={searchParams} />
    </Suspense>
  );
}

async function TokenBody({ searchParams }: { searchParams: Promise<{ pay?: string; usd?: string }> }) {
  const params = await searchParams;
  const data = await loadDepositPage(params.pay, params.usd);
  if (!data.usd || Number(data.usd) <= 0) redirect("/home/add/crypto");
  return <TokenSelect tokens={data.tokens} pay={data.pay} usd={data.usd} />;
}
