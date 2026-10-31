import { Suspense } from "react";
import Loading from "../../../loading";
import { MobileMoneyForm } from "@/components/funding-methods";
import { fonbnkStatus } from "@/lib/onramp";
import { fonbnkPlace, viewer } from "@/lib/session";

export default function MobilePage({ searchParams }: { searchParams: Promise<{ side?: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <MobileBody searchParams={searchParams} />
    </Suspense>
  );
}

async function MobileBody({ searchParams }: { searchParams: Promise<{ side?: string }> }) {
  const who = await viewer();
  const [{ side }, place] = await Promise.all([searchParams, fonbnkPlace()]);
  return (
    <main>
      <MobileMoneyForm
        status={fonbnkStatus(process.env)}
        address={who.address}
        side={side === "sell" ? "sell" : "buy"}
        country={place.country}
        unit={place.unit}
      />
    </main>
  );
}
