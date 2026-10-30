import { GOOD_DOLLAR } from "@/lib/stables";
import { celoMarket } from "@/lib/celo-market";
import { GDX_RESERVE } from "@/lib/gdx-reserve";

/** Thin Uniswap v3 G$/USDm pool. Fallback only; the Reserve is the market. */
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
    id: "buy-usdc",
    title: "Need USDC or CELO first",
    body: "The Reserve takes USDm. Uniswap can turn CELO or USDC into G$ if you do not hold USDm.",
    href: uniswapSwapHref(celoMarket.usdc, GOOD_DOLLAR),
  },
  {
    id: "buy-celo",
    title: "Buy G$ with CELO",
    body: "Uniswap on Celo. Liquidity is much thinner than the Reserve.",
    href: uniswapSwapHref("NATIVE", GOOD_DOLLAR),
  },
] as const;

export const gdxPoolHref = `https://app.uniswap.org/explore/pools/celo/${GDX_UNISWAP_USDM}`;
export const gdxScreenHref = `https://dexscreener.com/celo/${GDX_UNISWAP_USDM}`;
export const gdxReserveHref = `https://celoscan.io/address/${GDX_RESERVE}`;
