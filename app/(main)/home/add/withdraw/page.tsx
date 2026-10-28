import { Suspense } from "react";
import Link from "next/link";
import Loading from "../../../loading";
import { FlowHeader } from "@/components/deposit-flow";
import { WithdrawForm } from "@/components/forms";
import { MoveOut } from "@/components/move-out";
import { loadHoldings } from "@/lib/holdings";
import { loadPortfolio } from "@/lib/protocol";
import { loadQuote } from "@/lib/rates";
import { loadMoveOut } from "@/lib/send";
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
  const [holdings, choices] = await Promise.all([
    loadHoldings(who.address, portfolio, quote),
    loadMoveOut(who.address),
  ]);
  return (
    <main className="px-4 pb-8">
      <FlowHeader title="Withdraw" back="/home" />
      <section>
        <h2 className="text-sm font-semibold">To another address</h2>
        <p className="mt-1 mb-4 text-sm leading-relaxed text-muted-foreground">
          ETH or USDC on this network. Every other token, including Celo, is on{" "}
          <Link href="/home/send/address" className="font-medium text-foreground">
            Send
          </Link>
          .
        </p>
        <MoveOut choices={choices} />
      </section>
      <section className="mt-8">
        <h2 className="text-sm font-semibold">From a saving</h2>
        <div className="mt-3">
          <WithdrawForm idleUsd={holdings.idleUsd} />
        </div>
      </section>
    </main>
  );
}
