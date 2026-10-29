import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toFunctionSelector } from "viem";
import { fvIdentifierMessage, fvLink, identityAbi, identityExpiry, ubiAbi } from "@/lib/good-fv";

const account = "0xf7dbD2867f55832E4A05E16Cd69cB57A70923cDD";

describe("GoodDollar face check", () => {
  it("puts the account where the Identity SDK puts it", () => {
    const message = fvIdentifierMessage(account);
    assert.equal(message.startsWith(`Sign${account}`), true);
    assert.equal(message.includes("unique identifier"), true);
  });

  it("packs the face-check URL the way GoodID reads", () => {
    const href = fvLink({
      account,
      nonce: "1",
      signature: "0xab",
      callback: "https://rvess.xyz/settings",
      popup: false,
    });
    assert.equal(href.startsWith("https://goodid.gooddollar.org/?lz="), true);
    assert.equal(href.includes("rdu"), false);
  });

  it("expires identity after the authentication period", () => {
    assert.equal(identityExpiry(1_700_000_000n, 90n), 1_700_000_000 + 90 * 86400);
    assert.equal(identityExpiry(0n, 90n), 0);
  });

  it("matches UBIScheme.claim()", () => {
    assert.equal(toFunctionSelector("claim()"), "0x4e71d92d");
    assert.ok(ubiAbi.length > 0);
  });

  it("matches IdentityV4.connectAccount(address)", () => {
    assert.equal(toFunctionSelector("connectAccount(address)"), "0xd21685f4");
    assert.ok(identityAbi.some((item) => "name" in item && item.name === "connectAccount"));
  });
});
