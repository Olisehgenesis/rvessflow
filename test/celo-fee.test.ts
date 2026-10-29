import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickCeloFeeFromBalances } from "@/lib/celo-fee";

describe("Celo fee currency", () => {
  it("uses USDT when it can cover the fee", () => {
    const pick = pickCeloFeeFromBalances([20_000n, 1_000_000n, 1n]);
    assert.equal(pick?.label, "USDT");
  });

  it("uses USDC when USDT is not enough", () => {
    const pick = pickCeloFeeFromBalances([1n, 20_000n, 1n]);
    assert.equal(pick?.label, "USDC");
  });

  it("uses USDm when USDT and USDC are not enough", () => {
    const pick = pickCeloFeeFromBalances([1n, 1n, 20_000_000_000_000_000n]);
    assert.equal(pick?.label, "USDm");
  });

  it("falls back to native CELO when no dollar token covers the fee", () => {
    assert.equal(pickCeloFeeFromBalances([1n, 1n, 1n]), null);
  });
});
