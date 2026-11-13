import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyIdentifier,
  clampOnceAmount,
  defaultReceiveConfig,
  periodSeconds,
  streamCommitment,
  streamPlanAmounts,
  truncateAddress,
} from "@/lib/receive-link";

describe("receive identifier classification", () => {
  it("accepts a checksum-looking address", () => {
    const result = classifyIdentifier("0x1234567890abcdef1234567890abcdef12345678");
    assert.equal(result.kind, "address");
    if (result.kind === "address") assert.equal(result.value, "0x1234567890abcdef1234567890abcdef12345678");
  });

  it("rejects a truncated address", () => {
    const result = classifyIdentifier("0x1234");
    assert.equal(result.kind, "invalid");
  });

  it("treats numeric IDs separately from usernames", () => {
    assert.equal(classifyIdentifier("12345").kind, "userId");
    assert.equal(classifyIdentifier("olisehgenesis").kind, "username");
  });

  it("rejects empty and overlong values", () => {
    assert.equal(classifyIdentifier("").kind, "invalid");
    assert.equal(classifyIdentifier("a".repeat(200)).kind, "invalid");
  });
});

describe("stream commitment math", () => {
  it("computes monthly totals from rate and duration", () => {
    assert.equal(streamCommitment("10", "monthly", 30), "10");
    assert.equal(streamCommitment("10", "weekly", 28), "40");
    assert.equal(streamCommitment("5", "daily", 7), "35");
  });

  it("maps into vault stream amount + duration", () => {
    const plan = streamPlanAmounts("10", "monthly", 30);
    assert.equal(plan.amount, "10");
    assert.equal(plan.duration, 30 * periodSeconds("daily"));
  });
});

describe("give-once limits", () => {
  it("enforces min and max", () => {
    const config = defaultReceiveConfig("0x1234567890abcdef1234567890abcdef12345678");
    config.onceMin = "5";
    config.onceMax = "100";
    assert.equal(clampOnceAmount("10", config), "10");
    assert.equal(clampOnceAmount("1", config), null);
    assert.equal(clampOnceAmount("250", config), null);
  });

  it("floors at 0.1 usd by default", () => {
    const config = defaultReceiveConfig("0x1234567890abcdef1234567890abcdef12345678");
    assert.equal(config.onceMin, "0.1");
    assert.equal(clampOnceAmount("0.1", config), "0.1");
    assert.equal(clampOnceAmount("0.05", config), null);
  });
});

describe("display helpers", () => {
  it("truncates addresses", () => {
    assert.equal(truncateAddress("0x1234567890abcdef1234567890abcdef12345678"), "0x1234…5678");
  });
});
