import { Suspense } from "react";
import Loading from "../../loading";
import { AddMoneyForm, WithdrawIdle } from "@/components/forms";
import { Page } from "@/components/ui-bits";
import { show } from "@/lib/display";
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
  return (
    <Page title="Add money" back="/home">
      <p className="mb-4 text-sm text-muted-foreground">
        Wallet balance {quote.unit} {show(data.wallet, quote)}. This moves USDCx into your vault so goals can use it.
      </p>
      <AddMoneyForm />
      {BigInt(data.idle) > 0n ? (
        <div className="mt-8">
          <p className="mb-2 text-sm text-muted-foreground">Idle in the vault: {quote.unit} {show(data.idle, quote)}</p>
          <WithdrawIdle amount={data.idle} />
        </div>
      ) : null}
    </Page>
  );
}
