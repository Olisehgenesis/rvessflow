import { Suspense } from "react";
import { LockForm } from "@/components/forms";
import Loading from "../../loading";
import { Page } from "@/components/ui-bits";
import { loadPayChoices } from "@/lib/holdings";
import { loadPrices } from "@/lib/prices";
import { loadPortfolio, lockAbi } from "@/lib/protocol";
import { loadQuote } from "@/lib/rates";
import { viewer } from "@/lib/session";
import { vaultSite } from "@/lib/vault-site";
import { zeroAddress, type Address } from "viem";

export default function NewLockPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NewLockBody />
    </Suspense>
  );
}

async function yieldRate(net: "celo" | "base", token: Address) {
  if (token === zeroAddress) return "0";
  try {
    const site = vaultSite(net);
    const rate = await site.client.readContract({
      address: site.locks,
      abi: lockAbi,
      functionName: "yieldPerTokenPerSecond",
      args: [token],
    });
    return rate.toString();
  } catch {
    return "0";
  }
}

async function NewLockBody() {
  const who = await viewer();
  const celo = vaultSite("celo");
  const base = vaultSite("base");
  const [data, quote, choices, prices, celoUsd, baseUsd, celoGdx] = await Promise.all([
    loadPortfolio(who),
    loadQuote(),
    loadPayChoices(who.address),
    loadPrices(),
    yieldRate("celo", celo.fusdcx),
    yieldRate("base", base.fusdcx),
    yieldRate("celo", celo.goodDollar),
  ]);
  return (
    <Page title="Create lock" back="/vaults">
      <LockForm
        penalty={data.protocol.penaltyBps}
        quote={quote}
        choices={choices}
        earnRate={{ celo: celoUsd, base: baseUsd, gdx: celoGdx }}
        usdcUsd8={prices.usdcUsd8.toString()}
      />
    </Page>
  );
}
