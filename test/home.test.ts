import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { balanceColumns, hasTokenAmount, showGettingStarted, usdcEquivalent } from "@/lib/home-math";
import { formatUsd8, formatUsdRow, roundUsdCents } from "@/lib/pay-math";

describe("home balance columns", () => {
  it("splits a total into available, streaming, and locked that add back up", () => {
    const total = 12_842_000_000n;
    const streaming = 3_426_000_000n;
    const locked = 2_198_000_000n;
    const columns = balanceColumns(total, streaming, locked);
    assert.equal(columns.available + columns.streaming + columns.locked, total);
    assert.equal(columns.streaming, streaming);
    assert.equal(columns.locked, locked);
  });

  it("keeps a wallet-only balance in available", () => {
    const columns = balanceColumns(90_000_000n, 0n, 0n);
    assert.equal(columns.available, 90_000_000n);
    assert.equal(columns.streaming, 0n);
    assert.equal(columns.locked, 0n);
  });

  it("does not let streaming and locked exceed the total", () => {
    const columns = balanceColumns(100n, 80n, 50n);
    assert.equal(columns.available + columns.streaming + columns.locked, 100n);
    assert.equal(columns.available, 0n);
  });

  it("converts a dollar value into USDC at the Chainlink price", () => {
    assert.equal(usdcEquivalent(10_000_000_000n, 99_980_000n), "100.02");
    assert.equal(usdcEquivalent(0n, 100_000_000n), "0.00");
  });
});

describe("usd row rounding", () => {
  it("rounds half-up and marks dust so rows can add up to the total", () => {
    assert.equal(formatUsd8(1_500_000n), "0.02");
    assert.equal(formatUsd8(1_499_999n), "0.01");
    assert.equal(formatUsdRow(400_000n), "<0.01");
    assert.equal(formatUsdRow(0n), "0.00");
    assert.equal(roundUsdCents(18_000_000n) + roundUsdCents(1_700_000n), 20n);
  });
});

describe("getting started", () => {
  it("shows first steps only when the account has no positions and no balance", () => {
    assert.equal(showGettingStarted({ goals: 0, locks: 0, groups: 0, amounts: ["0.00", "0.000000"] }), true);
    assert.equal(showGettingStarted({ goals: 0, locks: 0, groups: 0, amounts: ["0.19"] }), false);
    assert.equal(showGettingStarted({ goals: 1, locks: 0, groups: 0, amounts: ["0.00"] }), false);
    assert.equal(showGettingStarted({ goals: 0, locks: 2, groups: 0, amounts: [] }), false);
    assert.equal(showGettingStarted({ goals: 0, locks: 0, groups: 1, amounts: ["0.00"] }), false);
    assert.equal(hasTokenAmount("0.000307"), true);
  });
});
