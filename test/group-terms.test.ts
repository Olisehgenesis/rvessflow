import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GDX } from "@/lib/assets";
import { readCycles } from "@/lib/cycle";
import { groupTerms, groupTokenAddress, groupUnit } from "@/lib/group-token";

describe("group terms", () => {
  it("accepts any whole cycle count up to 520", () => {
    assert.equal(readCycles("2"), 2);
    assert.equal(readCycles(52), 52);
    assert.throws(() => readCycles("3.5"));
    assert.throws(() => readCycles(0));
    assert.throws(() => readCycles(521));
  });

  it("puts Good Dollar on Celo", () => {
    assert.deepEqual(groupTerms("base", "gdx"), { network: "celo", token: "gdx" });
    assert.equal(groupTokenAddress("celo", "gdx"), GDX);
    assert.equal(groupUnit("gdx"), "G$");
    assert.equal(groupUnit("usd"), "USD");
  });
});
