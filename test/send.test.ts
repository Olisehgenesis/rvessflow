import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activityUnits, ethReserve, parseSendAmount, portion, spendableEth, spendableUsdc, usdcFeeReserve } from "@/lib/send-math";

describe("send amounts", () => {
  it("reads USDC in 6 decimals and ETH in 18", () => {
    assert.equal(parseSendAmount("usdc", "1.5"), 1_500_000n);
    assert.equal(parseSendAmount("eth", "0.01"), 10_000_000_000_000_000n);
    assert.equal(parseSendAmount("usdcx", "2"), 2_000_000_000_000_000_000n);
  });

  it("rejects an empty or zero amount", () => {
    assert.throws(() => parseSendAmount("eth", "0"), /greater than zero/);
    assert.throws(() => parseSendAmount("usdt", "1.1234567"), /greater than zero/);
  });

  it("keeps a fee reserve on ETH and records dollar tokens at 18 decimals", () => {
    assert.equal(spendableEth(ethReserve), 0n);
    assert.equal(spendableEth(ethReserve + 5n), 5n);
    assert.deepEqual(activityUnits("usdt", 2_500_000n), { amount: (2_500_000n * 10n ** 12n).toString(), asset: "usdcx" });
    assert.deepEqual(activityUnits("eth", 4n), { amount: "4", asset: "ethx" });
  });

  it("lets the slider reach the exact maximum", () => {
    assert.equal(portion(1_000_000n, 0), 0n);
    assert.equal(portion(1_000_000n, 500), 500_000n);
    assert.equal(portion(1_000_000n, 1000), 1_000_000n);
  });

  it("keeps USDC for the fee only when ETH cannot pay it", () => {
    assert.equal(spendableUsdc(2_000_000n, true), 2_000_000n);
    assert.equal(spendableUsdc(usdcFeeReserve, false), 0n);
    assert.equal(spendableUsdc(usdcFeeReserve + 25n, false), 25n);
  });
});
