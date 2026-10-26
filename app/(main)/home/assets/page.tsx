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
        <Link href="/vaults" className="flex h-11 items-center justify-center rounded-full bg-card text-sm font-medium shadow-[0_8px_20px_rgba(20,27,45,0.05)]">
          Vaults
        </Link>
        <Link href="/home/add" className="flex h-11 items-center justify-center rounded-full bg-[#141B2D] text-sm font-medium text-white">
          Add money
        </Link>
      </div>
    </Page>
  );
}
