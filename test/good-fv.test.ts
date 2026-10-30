import assert from "node:assert/strict";
import { describe, it } from "node:test";
import LZString from "lz-string";
import { toFunctionSelector } from "viem";
import { fvIdentifierMessage, fvLink, identityAbi, identityExpiry, ubiAbi } from "@/lib/good-fv";

const account = "0xf7dbD2867f55832E4A05E16Cd69cB57A70923cDD";

describe("GoodDollar face check", () => {
  it("puts the checksum account where GoodID substitutes <account>", () => {
    const message = fvIdentifierMessage(account);
    assert.equal(message.includes(`account ${account}`), true);
    assert.equal(message.includes("<account>"), false);
    assert.equal(message.includes("unique identifier"), true);
  });

  it("packs the face-check URL the way GoodID reads", () => {
    const href = fvLink({
      account: account.toLowerCase() as typeof account,
      nonce: "1",
      signature: "0xab",
      callback: "https://rvess.xyz/settings/verify?from=fv",
      popup: false,
    });
    assert.equal(href.startsWith("https://goodid.gooddollar.org/?lz="), true);
    const packed = new URL(href).searchParams.get("lz") ?? "";
    const params = JSON.parse(LZString.decompressFromEncodedURIComponent(packed) ?? "{}") as {
      account: string;
      rdu: string;
      cbu?: string;
      chain: number;
      fvsig: string;
      nonce: string;
    };
    assert.equal(params.account, account);
    assert.equal(params.rdu, "https://rvess.xyz/settings/verify?from=fv");
    assert.equal(params.cbu, undefined);
    assert.equal(params.chain, 42220);
    assert.equal(params.fvsig, "0xab");
    assert.equal(params.nonce, "1");
  });

  it("packs iframe callbacks as cbu", () => {
    const href = fvLink({
      account,
      nonce: "2",
      signature: "0xcd",
      callback: "https://www.rvess.xyz/api/fv-callback",
      popup: true,
    });
    const packed = new URL(href).searchParams.get("lz") ?? "";
    const params = JSON.parse(LZString.decompressFromEncodedURIComponent(packed) ?? "{}") as {
      cbu?: string;
      rdu?: string;
    };
    assert.equal(params.cbu, "https://www.rvess.xyz/api/fv-callback");
    assert.equal(params.rdu, undefined);
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
