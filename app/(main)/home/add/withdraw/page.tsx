import { Suspense } from "react";
import Loading from "../../../loading";
import { FlowHeader } from "@/components/deposit-flow";
import { WithdrawForm } from "@/components/forms";
import { loadHoldings } from "@/lib/holdings";
import { loadPortfolio } from "@/lib/protocol";
import { loadQuote } from "@/lib/rates";
import { viewer } from "@/lib/session";

export default function WithdrawPage() {
  return (
    <Suspense fallback={<Loading />}>
      <WithdrawBody />
    </Suspense>
  );
}

async function WithdrawBody() {
  const who = await viewer();
  const [portfolio, quote] = await Promise.all([loadPortfolio(who), loadQuote()]);
  const holdings = await loadHoldings(who.address, portfolio, quote);
  return (
    <main className="px-4 pt-4 pb-8">
      <FlowHeader title="Withdraw" back="/home/add" />
      <WithdrawForm idleUsd={holdings.idleUsd} />
    </main>
  );
}
