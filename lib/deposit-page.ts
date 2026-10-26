import "server-only";

import { depositTokenMeta, readDepositQuery, type DepositPreview } from "@/lib/deposit-math";
import { depositPreview } from "@/lib/funding";
import { loadHoldings, type PayChoice } from "@/lib/holdings";
import type { PayAsset } from "@/lib/pay-math";
import { loadPortfolio } from "@/lib/protocol";
import { loadQuote } from "@/lib/rates";
import { viewer, type Viewer } from "@/lib/session";

export type DepositToken = PayChoice & { name: string };

export type DepositPageData = {
  who: Viewer;
  totalUsd: string;
  available: string;
  streaming: string;
  locked: string;
  idleUsd: string;
  tokens: DepositToken[];
  pay: PayAsset;
  usd: string;
  preview: DepositPreview | null;
  quoteError: string;
};

export async function loadDepositPage(payRaw?: string, usdRaw?: string): Promise<DepositPageData> {
  const query = readDepositQuery(payRaw, usdRaw);
  const who = await viewer();
  const [portfolio, quote] = await Promise.all([loadPortfolio(who), loadQuote()]);
  const holdings = await loadHoldings(who.address, portfolio, quote);
  const tokens = holdings.choices.map((choice) => ({ ...choice, name: depositTokenMeta[choice.pay].name }));
  let preview: DepositPreview | null = null;
  let quoteError = "";
  if (query.usd && Number(query.usd) > 0) {
    try {
      preview = await depositPreview(who.address, query.pay, query.usd);
    } catch (error) {
      quoteError = error instanceof Error ? error.message : "The quote failed.";
    }
  }
  return {
    who,
    totalUsd: holdings.totalUsd,
    available: holdings.available,
    streaming: holdings.streaming,
    locked: holdings.locked,
    idleUsd: holdings.idleUsd,
    tokens,
    pay: query.pay,
    usd: query.usd,
    preview,
    quoteError,
  };
}
