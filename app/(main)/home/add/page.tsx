import { Suspense } from "react";
import Loading from "../../loading";
import { AddMoneyForm, WithdrawForm } from "@/components/forms";
import { Page } from "@/components/ui-bits";
import { loadHoldings } from "@/lib/holdings";
import { loadQuote } from "@/lib/rates";
import { loadPortfolio } from "@/lib/protocol";
import { viewer } from "@/lib/session";

export default function AddMoneyPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AddBody />
    </Suspense>
  );
}

async function AddBody() {
  const who = await viewer();
  const [data, quote] = await Promise.all([loadPortfolio(who), loadQuote()]);
  const holdings = await loadHoldings(who.address, data, quote);
  return (
    <Page title="Add money" back="/home">
      <p className="mb-4 text-sm text-muted-foreground">
        Pay with USDC, USDT, or ETH. The amount is in USD, and it is wrapped into your vault.
      </p>
      <AddMoneyForm choices={holdings.choices} />
      <div className="mt-8">
        <h2 className="mb-2 text-base font-semibold">Withdraw</h2>
        <WithdrawForm idleUsd={holdings.idleUsd} />
      </div>
    </Page>
  );
}
