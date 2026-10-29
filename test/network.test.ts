import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { celoRpcAnkr, celoRpcForno, celoRpcUrls } from "@/lib/network";

describe("Celo RPC", () => {
  it("uses Ankr first and Forno as backup", () => {
    const urls = celoRpcUrls();
    assert.equal(urls[0], celoRpcAnkr);
    assert.equal(urls[1], celoRpcForno);
    assert.equal(urls.length, 2);
  });
});
