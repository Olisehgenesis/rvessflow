import { Suspense } from "react";
import Link from "next/link";
import Loading from "../../loading";
import { AssetList } from "@/components/home-screen";
import { Page } from "@/components/ui-bits";
import { loadHoldings } from "@/lib/holdings";
import { loadPortfolio } from "@/lib/protocol";
import { loadQuote } from "@/lib/rates";
import { viewer } from "@/lib/session";

export default function AssetsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AssetsBody />
    </Suspense>
  );
}

async function AssetsBody() {
  const who = await viewer();
  const [data, quote] = await Promise.all([loadPortfolio(who), loadQuote()]);
  const holdings = await loadHoldings(who.address, data, quote);
  return (
    <Page title="Your assets" back="/home">
      <p className="mb-4 text-sm text-muted-foreground">Balances priced on Base. USD stays first. A local currency, including UGX, shows under each amount when you pick one in More.</p>
      <AssetList rows={holdings.rows} localUnit={holdings.localUnit} />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link href="/home/add/receive" className="flex h-11 items-center justify-center rounded-full border border-border bg-card text-sm font-medium">
          Receive
        </Link>
        <Link href="/vaults" className="flex h-11 items-center justify-center rounded-full border border-border bg-card text-sm font-medium">
          Vaults
        </Link>
      </div>
      <Link href="/home/add" className="mt-2 flex h-12 items-center justify-center rounded-full bg-[#D4F06B] text-sm font-semibold text-[#141414]">
        Add money
      </Link>
    </Page>
  );
}
