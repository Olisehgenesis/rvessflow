import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GOOD_DOLLAR } from "@/lib/stables";
import { GDX_UNISWAP_USDM, gdxSwaps, uniswapSwapHref } from "@/lib/gdx-swap";

describe("G$ Uniswap links", () => {
  it("opens Uniswap on Celo with G$ as the output", () => {
    const href = uniswapSwapHref("NATIVE", GOOD_DOLLAR);
    assert.equal(href.includes("chain=celo"), true);
    assert.equal(href.includes("inputCurrency=NATIVE"), true);
    assert.equal(href.toLowerCase().includes(GOOD_DOLLAR.toLowerCase()), true);
  });

  it("lists buy and sell routes on the USDm pool", () => {
    assert.equal(gdxSwaps.length, 4);
    assert.ok(gdxSwaps.every((row) => row.href.startsWith("https://app.uniswap.org/swap")));
    assert.equal(GDX_UNISWAP_USDM.startsWith("0x"), true);
  });
});
