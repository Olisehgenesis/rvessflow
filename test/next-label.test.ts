import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filledName, nextLabel } from "@/lib/next-label";

describe("nextLabel", () => {
  it("starts at #1", () => {
    assert.equal(nextLabel("flow", []), "flow#1");
  });

  it("skips names this account already has", () => {
    assert.equal(nextLabel("flow", ["genes", "flow#1", "flow#3"]), "flow#2");
  });

  it("fills an empty submit", () => {
    assert.equal(filledName("  ", "flow", ["flow#1"]), "flow#2");
    assert.equal(filledName(" genes ", "flow", ["flow#1"]), "genes");
  });
});
