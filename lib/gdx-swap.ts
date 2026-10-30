import { GOOD_DOLLAR } from "@/lib/stables";
import { celoMarket } from "@/lib/celo-market";

/** Deepest Uniswap v3 G$ pool on Celo (G$/USDm), from DexScreener Oct 2026. */
export const GDX_UNISWAP_USDM = "0x9491d57c5687AB75726423B55AC2d87D1cDa2c3F";

export function uniswapSwapHref(input: string, output: string) {
  const url = new URL("https://app.uniswap.org/swap");
  url.searchParams.set("chain", "celo");
  url.searchParams.set("inputCurrency", input);
  url.searchParams.set("outputCurrency", output);
  return url.toString();
}

export const gdxSwaps = [
  {
    id: "buy-usdm",
    title: "Buy G$ with USDm",
    body: "Uniswap on Celo. This is the deepest G$ pool we use.",
    href: uniswapSwapHref(celoMarket.usdm, GOOD_DOLLAR),
  },
  {
    id: "buy-celo",
    title: "Buy G$ with CELO",
    body: "Uniswap on Celo. Liquidity is thinner than USDm.",
    href: uniswapSwapHref("NATIVE", GOOD_DOLLAR),
  },
  {
    id: "sell-usdm",
    title: "Sell G$ for USDm",
    body: "Back into Mento dollars on the same Uniswap pool.",
    href: uniswapSwapHref(GOOD_DOLLAR, celoMarket.usdm),
  },
  {
    id: "sell-celo",
    title: "Sell G$ for CELO",
    body: "Uniswap on Celo.",
    href: uniswapSwapHref(GOOD_DOLLAR, "NATIVE"),
  },
] as const;

export const gdxPoolHref = `https://app.uniswap.org/explore/pools/celo/${GDX_UNISWAP_USDM}`;
export const gdxScreenHref = `https://dexscreener.com/celo/${GDX_UNISWAP_USDM}`;
