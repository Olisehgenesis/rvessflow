import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { knownRevert } from "@/lib/revert-reason";

describe("revert reasons", () => {
  it("names an unfunded yield lock", () => {
    assert.equal(
      knownRevert("execution reverted: 0xfa3505cf"),
      "Earn yield isn't funded for this token yet. Leave it off and create the lock.",
    );
    assert.equal(knownRevert("The transaction reverted."), null);
  });
});
