import { redirect } from "next/navigation";
import { Suspense } from "react";
import Loading from "../../../loading";
import { ReviewDeposit } from "@/components/deposit-flow";
import { depositHref } from "@/lib/deposit-math";
import { loadDepositPage } from "@/lib/deposit-page";

export default function ReviewPage({ searchParams }: { searchParams: Promise<{ pay?: string; usd?: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <ReviewBody searchParams={searchParams} />
    </Suspense>
  );
}

async function ReviewBody({ searchParams }: { searchParams: Promise<{ pay?: string; usd?: string }> }) {
  const params = await searchParams;
  const data = await loadDepositPage(params.pay, params.usd);
  if (!data.usd || Number(data.usd) <= 0) redirect("/home/add/crypto");
  if (!data.preview) redirect(depositHref("/home/add/crypto", data.pay, data.usd));
  return <ReviewDeposit pay={data.pay} usd={data.usd} preview={data.preview} />;
}
