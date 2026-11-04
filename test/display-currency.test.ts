import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assignNameCode, chosenName, localFromUsd, priced, showsLocal, streamDigits, usdCaption, usdFromLocal } from "@/lib/display";
import type { Quote } from "@/lib/quote";

const ugx: Quote = { code: "ugx", unit: "UGX", perToken: 3700, digits: 0, note: "" };
const usd: Quote = { code: "usd", unit: "USD", perToken: 1, digits: 2, note: "" };

describe("display currency", () => {
  it("turns a dollar balance into shillings", () => {
    assert.equal(showsLocal(ugx), true);
    assert.equal(localFromUsd("24.96", ugx), "92352");
    assert.equal(priced("24.96", ugx), "UGX 92,352");
  });

  it("turns a typed shilling amount back into dollars", () => {
    assert.equal(usdFromLocal("92352", ugx), "24.96");
    assert.equal(usdFromLocal("24.96", usd), "24.96");
  });

  it("keeps a chosen name and skips a placeholder", () => {
    assert.equal(chosenName("  Ada  "), "Ada");
    assert.equal(chosenName("Wallet"), null);
    assert.equal(chosenName("Passkey"), null);
    assert.equal(chosenName("0x1234…abcd"), null);
  });

  it("keeps shillings whole and small dollar amounts visible", () => {
    assert.equal(streamDigits(10n ** 15n, ugx), 0);
    assert.equal(usdCaption(2n * 10n ** 15n), "$0.002");
    assert.equal(usdCaption(250n * 10n ** 16n), "$2.50");
  });

  it("adds the next number when a name is taken", () => {
    assert.equal(assignNameCode("Ada", []), "Ada");
    assert.equal(assignNameCode("Ada", ["Ada"]), "Ada 2");
    assert.equal(assignNameCode("Ada", ["Ada", "Ada 2"]), "Ada 3");
    assert.equal(assignNameCode("Ada 3", ["ada 3"]), "Ada 2");
    assert.equal(assignNameCode("Ada 3", ["Ada", "Ada 2", "ada 3"]), "Ada 4");
  });
});
