import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fundForNet, parseUsd } from "@/lib/pay-math";
import {
  buildDepositPreview,
  depositGasUnits,
  executionUsd8,
  formatImpact,
  matchesToken,
  maxUsdInput,
  networkFeeUsd8,
  priceImpactBps,
  readDepositQuery,
  shortHash,
} from "@/lib/deposit-math";

describe("deposit quote math", () => {
  it("prices a USDC deposit from the protocol fee, with no pool impact", () => {
    const net = parseUsd("100") * 10n ** 12n;
    const sized = fundForNet(net);
    const preview = buildDepositPreview({
      pay: "usdc",
      typedUsdMicros: parseUsd("100"),
      credit: sized.credit,
      fee: sized.fee,
      underlying: sized.underlying,
      amountIn: sized.underlying,
      amountInMax: sized.underlying,
      usdcUsd8: 100_000_000n,
      tokenUsd8: 100_000_000n,
      networkFeeUsd8: 40_000_000n,
    });
    assert.equal(preview.receiveUsd, "100.00");
    assert.equal(preview.protocolFeePct, "0.3%");
    assert.equal(preview.slippage, "No swap");
    assert.equal(preview.deadline, "20 minutes");
    assert.equal(preview.priceImpact, "0.00%");
    assert.equal(preview.priceImpactSafe, true);
    assert.equal(preview.networkFeeUsd, "0.40");
    assert.ok(preview.protocolFeeUsd !== "0.00");
    assert.equal(preview.totalFeeKnown, true);
  });

  it("turns a worse pool price into basis points", () => {
    const execution = executionUsd8(100_000_000n, 100_000_000n, 100_180_361n, 6);
    const bps = priceImpactBps(99_970_000n, execution);
    assert.equal(formatImpact(bps > 0n ? bps : 0n).endsWith("%"), true);
    assert.equal(formatImpact(18n), "0.18%");
    assert.equal(formatImpact(0n), "0.00%");
    const preview = buildDepositPreview({
      pay: "usdt",
      typedUsdMicros: parseUsd("100"),
      credit: 100n * 10n ** 18n,
      fee: 300_000_000_000_000_000n,
      underlying: 100_300_000n,
      amountIn: 100_480_540n,
      amountInMax: 100_982_943n,
      usdcUsd8: 100_000_000n,
      tokenUsd8: 99_970_000n,
      networkFeeUsd8: null,
    });
    assert.equal(preview.networkFeeKnown, false);
    assert.equal(preview.slippage, "0.5%");
    assert.match(preview.rate, /^1 USDT = \$/);
    assert.equal(preview.symbol, "USDT");
    assert.equal(preview.priceImpactSafe, adverseSafe(preview.priceImpact));
  });

  it("estimates the network fee from gas, base fee, and ETH/USD", () => {
    const usd8 = networkFeeUsd8(200_000n, 1_000_000_000n, 200_000_000_000n);
    assert.equal(usd8, 40_000_000n);
    const withSwap = depositGasUnits("eth", 120_000n, { approveWrap: true, approveRouter: false, resetRouter: false });
    const plain = depositGasUnits("usdc", 0n, { approveWrap: false, approveRouter: false, resetRouter: false });
    assert.ok(withSwap > plain);
    assert.equal(plain, 160_000n);
  });

  it("filters tokens and floors a balance to a USD input", () => {
    assert.equal(matchesToken("usdt", "stable", ""), true);
    assert.equal(matchesToken("eth", "stable", ""), false);
    assert.equal(matchesToken("usdc", "popular", "usd coin"), true);
    assert.equal(matchesToken("usdt", "other", ""), false);
    assert.deepEqual(readDepositQuery("eth", "25.5"), { pay: "eth", usd: "25.5" });
    assert.deepEqual(readDepositQuery("dai", "10.123"), { pay: "usdc", usd: "" });
    assert.equal(maxUsdInput(1_240_500_000_00n), "1240.50");
    assert.equal(maxUsdInput(0n), "0.00");
    assert.equal(shortHash(`0x${"ab".repeat(32)}`), "0xabab…abab");
  });
});

function adverseSafe(impact: string): boolean {
  const [whole, frac] = impact.replace("%", "").split(".");
  const bps = Number(whole) * 100 + Number(frac);
  return bps <= 100;
}
