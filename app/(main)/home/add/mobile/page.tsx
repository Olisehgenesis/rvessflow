import { Suspense } from "react";
import Loading from "../../../loading";
import { FlowHeader } from "@/components/deposit-flow";
import { MobileMoneyForm } from "@/components/funding-methods";
import { loadHoldings } from "@/lib/holdings";
import { fonbnkStatus } from "@/lib/onramp";
import { loadPortfolio } from "@/lib/protocol";
import { loadQuote } from "@/lib/rates";
import { viewer } from "@/lib/session";

const emptyTrade = { usdm: "0", gdx: "0", usdc: "0", usdt: "0", celo: "0" };

export default function MobilePage({ searchParams }: { searchParams: Promise<{ side?: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <MobileBody searchParams={searchParams} />
    </Suspense>
  );
}

async function MobileBody({ searchParams }: { searchParams: Promise<{ side?: string }> }) {
  const who = await viewer();
  const { side } = await searchParams;
  let trade = emptyTrade;
  try {
    const [data, quote] = await Promise.all([loadPortfolio(who), loadQuote()]);
    trade = (await loadHoldings(who.address, data, quote)).gdxTrade;
  } catch {
    // Widget still opens if balances cannot load.
  }
  return (
    <main className="px-4 pb-8">
      <FlowHeader title="Mobile money" back="/home/add" />
      <p className="mb-4 text-sm text-muted-foreground">
        Fonbnk moves USDT on Celo. Pick USDT to keep it, or G$ and we swap after the buy — or before a cash out.
      </p>
      <MobileMoneyForm status={fonbnkStatus(process.env)} address={who.address} side={side === "sell" ? "sell" : "buy"} trade={trade} />
    </main>
  );
}
