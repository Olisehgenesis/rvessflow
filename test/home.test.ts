import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appChainSuper, balanceColumns, flowingPlaces, hasTokenAmount, holdingCaption, liveHomeColumns, mainBalancePlaces, showGettingStarted, sortHoldingsByBalance, usdcEquivalent } from "@/lib/home-math";

describe("home balance columns", () => {
  it("does not count the other chain's vault twice in the USD super total", () => {
    const celoVault = 15_100_578_702_135_097_291n;
    const celoWallet = 96_820_080_174_908_912n;
    const superOnApp = appChainSuper({
      wallet: 0n,
      idle: 1n,
      held: 2_500_760_999_999_994_291n,
      streaming: 3_036_908_702_135_103_480n,
      locked: 9_562_909_000_000_000_000n,
      otherIdle: 1n,
      otherHeld: 2_500_760_999_999_994_291n,
      otherStreaming: 3_036_908_702_135_103_480n,
      otherLocked: 9_562_909_000_000_000_000n,
    });
    assert.equal(superOnApp, 0n);
    assert.equal(celoWallet + celoVault, 15_197_398_782_310_006_203n);
  });

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

  it("uses 2 decimals above 3 digits and 4 below that", () => {
    assert.equal(mainBalancePlaces(0n), 4);
    assert.equal(mainBalancePlaces(999n), 4);
    assert.equal(mainBalancePlaces(1000n), 2);
    assert.equal(mainBalancePlaces(127547n), 2);
  });

  it("adds two decimals when a second moves them, and a third when the flow is slower", () => {
    assert.equal(flowingPlaces(4, 0n), 4);
    assert.equal(flowingPlaces(4, 1_000_000n), 4);
    assert.equal(flowingPlaces(4, 200n), 6);
    assert.equal(flowingPlaces(4, 10n), 7);
    assert.equal(flowingPlaces(2, 10n), 5);
  });

  it("puts the largest asset first", () => {
    const rows = sortHoldingsByBalance([
      { key: "usd", amount: "0.99", usd: "0.99", local: "4325" },
      { key: "eth", amount: "0", usd: "0", local: "0" },
      { key: "gdx", amount: "23403.400259", usd: "2.97", local: "12971" },
    ]);
    assert.equal(rows[0]?.key, "gdx");
    assert.equal(rows[1]?.key, "usd");
    assert.equal(rows[2]?.key, "eth");
  });
});
