import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GDX, CUSDx } from "@/lib/assets";
import { tokenUsdWei } from "@/lib/flow-value";

const prices = {
  usdcUsd8: 100_000_000n,
  ethUsd8: 200_000_000_000n,
  gdxUsd8: 12_738n,
};

describe("flow token value", () => {
  it("keeps a dollar super token at one dollar", () => {
    assert.equal(tokenUsdWei(10n ** 18n, CUSDx, prices), 10n ** 18n);
  });

  it("prices G$ through the reserve instead of as a dollar", () => {
    const oneGdx = tokenUsdWei(10n ** 18n, GDX, prices);
    assert.equal(oneGdx, (10n ** 18n * 12_738n) / 100_000_000n);
    assert.ok(oneGdx < 10n ** 15n);
  });
});
