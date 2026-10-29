import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { balanceColumns, hasTokenAmount, holdingCaption, liveHomeColumns, showGettingStarted, usdcEquivalent } from "@/lib/home-math";

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

  it("credits a self-pay stream into available and raises the headline total", () => {
    const usdcUsd8 = 100_000_000n;
    const start = liveHomeColumns({
      elapsedMs: 0n,
      availableUsd8: 4_670_000_000n,
      streamingUsd8: 720_000_000n,
      lockedUsd8: 0n,
      usdcUsd8,
      inWeiPerSec: 10n ** 15n,
      inCapWei: 10n ** 18n,
      outWeiPerSec: 0n,
      streamWeiPerSec: 10n ** 15n,
      streamRemainingWei: 10n ** 18n,
    });
    const later = liveHomeColumns({
      elapsedMs: 10_000n,
      availableUsd8: 4_670_000_000n,
      streamingUsd8: 720_000_000n,
      lockedUsd8: 0n,
      usdcUsd8,
      inWeiPerSec: 10n ** 15n,
      inCapWei: 10n ** 18n,
      outWeiPerSec: 0n,
      streamWeiPerSec: 10n ** 15n,
      streamRemainingWei: 10n ** 18n,
    });
    assert.ok(later.available > start.available);
    assert.ok(later.streaming < start.streaming);
    assert.ok(later.total > start.total);
  });

  it("lowers the headline when a stream pays someone else", () => {
    const usdcUsd8 = 100_000_000n;
    const start = liveHomeColumns({
      elapsedMs: 0n,
      availableUsd8: 4_670_000_000n,
      streamingUsd8: 720_000_000n,
      lockedUsd8: 0n,
      usdcUsd8,
      inWeiPerSec: 0n,
      inCapWei: 0n,
      outWeiPerSec: 10n ** 15n,
      streamWeiPerSec: 10n ** 15n,
      streamRemainingWei: 10n ** 18n,
    });
    const later = liveHomeColumns({
      elapsedMs: 10_000n,
      availableUsd8: 4_670_000_000n,
      streamingUsd8: 720_000_000n,
      lockedUsd8: 0n,
      usdcUsd8,
      inWeiPerSec: 0n,
      inCapWei: 0n,
      outWeiPerSec: 10n ** 15n,
      streamWeiPerSec: 10n ** 15n,
      streamRemainingWei: 10n ** 18n,
    });
    assert.equal(later.available, start.available);
    assert.ok(later.streaming < start.streaming);
    assert.ok(later.total < start.total);
  });

  it("converts a dollar value into USDC at the Chainlink price", () => {
    assert.equal(usdcEquivalent(10_000_000_000n, 99_980_000n), "100.02");
    assert.equal(usdcEquivalent(0n, 100_000_000n), "0.00");
  });
});

describe("holding caption", () => {
  it("does not describe a fully streaming balance as loose money on the network", () => {
    assert.equal(holdingCaption("Base", 0n, 1n), "Streaming out");
    assert.equal(holdingCaption("Base", 5n, 1n), "Base · streaming out");
    assert.equal(holdingCaption("Base", 5n, 0n), "Base");
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
