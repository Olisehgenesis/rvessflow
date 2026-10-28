import { Suspense } from "react";
import { notFound } from "next/navigation";
import Loading from "../../../loading";
import { AssetList } from "@/components/home-screen";
import { Page } from "@/components/ui-bits";
import { loadHoldings } from "@/lib/holdings";
import { loadPortfolio } from "@/lib/protocol";
import { loadQuote } from "@/lib/rates";
import { viewer } from "@/lib/session";

const titles: Record<string, string> = { usd: "USD", eth: "ETH", celo: "CELO" };

export default function AssetGroupPage({ params }: { params: Promise<{ group: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <GroupBody params={params} />
    </Suspense>
  );
}

async function GroupBody({ params }: { params: Promise<{ group: string }> }) {
  const { group } = await params;
  const title = titles[group];
  if (!title) notFound();
  const who = await viewer();
  const [data, quote] = await Promise.all([loadPortfolio(who), loadQuote()]);
  const holdings = await loadHoldings(who.address, data, quote);
  const row = holdings.rows.find((item) => item.key === group);
  if (!row?.parts) notFound();
  return (
    <Page title={title} back="/home">
      <p className="mb-4 text-sm text-muted-foreground">These add up to the {title} balance. Each line is one token on one chain.</p>
      <AssetList rows={row.parts} localUnit={holdings.localUnit} />
    </Page>
  );
}
