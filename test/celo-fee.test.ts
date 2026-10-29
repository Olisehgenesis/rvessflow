import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { celoGasTreasury, pickCeloFeeCovering, pickCeloFeeFromBalances, tokenAmountForCeloGas, withSkimGas } from "@/lib/celo-fee";

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

  it("includes the skim transfer gas and Pimlico surcharge in the token amount", () => {
    const cost = withSkimGas(1_000_000_000_000n, 10_000_000_000n);
    assert.ok(cost > 1_000_000_000_000n);
    const usdt = tokenAmountForCeloGas({
      costWei: cost,
      nativePrice: 10_000_000_000n,
      tokenPrice: 10_000_000_000n,
      decimals: 6,
    });
    assert.ok(usdt >= 1n);
    assert.equal(celoGasTreasury.toLowerCase(), "0x50c503dffd9e8d0903bf33376f6ddd278209939a");
  });

  it("picks USDC when USDT cannot cover the quoted skim", () => {
    const pick = pickCeloFeeCovering([10n, 1_000_000n, 0n], [50_000n, 40_000n, 1n]);
    assert.equal(pick?.label, "USDC");
  });
});
