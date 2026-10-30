import { Suspense } from "react";
import Loading from "../../../loading";
import { SendScreen } from "@/components/send-screen";

export default function SendAddressPage({ searchParams }: { searchParams: Promise<{ asset?: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <SendAddressBody searchParams={searchParams} />
    </Suspense>
  );
}

async function SendAddressBody({ searchParams }: { searchParams: Promise<{ asset?: string }> }) {
  const query = await searchParams;
  return (
    <SendScreen
      mode="address"
      title="To another address"
      lead="The same address holds tokens on Base and on Celo. Pick the token and the chain."
      start={query.asset}
    />
  );
}
