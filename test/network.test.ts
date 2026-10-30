import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupKey, parseGroupKey, sameGroupKey } from "@/lib/group-network";
import { celoRpcAnkr, celoRpcForno, celoRpcUrls } from "@/lib/network";

describe("Celo RPC", () => {
  it("uses Ankr first and Forno as backup", () => {
    const urls = celoRpcUrls();
    assert.equal(urls[0], celoRpcAnkr);
    assert.equal(urls[1], celoRpcForno);
    assert.equal(urls.length, 2);
  });
});

describe("group keys", () => {
  it("keeps Celo ids URL-safe and still reads the old colon form", () => {
    const key = groupKey("celo", 1n);
    assert.equal(key.includes(":"), false);
    assert.deepEqual(parseGroupKey("celo:1"), { net: "celo", id: 1n });
    assert.deepEqual(parseGroupKey("celo-1"), { net: "celo", id: 1n });
    assert.equal(sameGroupKey("celo:1", "celo-1"), true);
    assert.equal(sameGroupKey("celo:1", key), true);
  });
});
