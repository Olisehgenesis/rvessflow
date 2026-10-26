import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { balanceColumns, hasTokenAmount, isWelcomeHome, usdcEquivalent } from "@/lib/home-math";

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

describe("welcome home", () => {
  it("shows the welcome screen only when goals, locks, and balances are empty", () => {
    assert.equal(isWelcomeHome({ goals: 0, locks: 0, amounts: ["0.00", "0.000000"] }), true);
    assert.equal(isWelcomeHome({ goals: 0, locks: 0, amounts: ["0.19"] }), false);
    assert.equal(isWelcomeHome({ goals: 1, locks: 0, amounts: ["0.00"] }), false);
    assert.equal(isWelcomeHome({ goals: 0, locks: 2, amounts: [] }), false);
    assert.equal(hasTokenAmount("0.000307"), true);
  });
});
