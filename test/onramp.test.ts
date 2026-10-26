import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { describe, it } from "node:test";
import { coinbaseJwt } from "@/lib/coinbase-jwt";
import {
  coinbaseOnrampUrl,
  coinbaseStatus,
  coinbaseTokenBody,
  kotaniOnrampBody,
  kotaniStatus,
  readUgx,
  transakSessionEndpoint,
  transakStatus,
  transakWidgetParams,
  ugandaPhone,
} from "@/lib/onramp";

describe("funding providers", () => {
  it("builds a Kotani onramp for Uganda mobile money into USDC on Base", () => {
    const body = kotaniOnrampBody({
      network: "MTN",
      phoneNumber: ugandaPhone("0772123456"),
      accountName: "Amina Nalwoga",
      fiatAmount: readUgx("50000"),
      receiverAddress: "0x4CC5313fCf12032aF023F099dC4af059Be466d7c",
      referenceId: "rvess-test",
    });
    assert.equal(body.chain, "BASE");
    assert.equal(body.token, "USDC");
    assert.equal(body.currency, "UGX");
    assert.equal(body.country, "UG");
    assert.equal(body.mobileMoney.providerNetwork, "MTN");
    assert.equal(body.mobileMoney.phoneNumber, "+256772123456");
    assert.equal(body.fiatAmount, 50000);
    assert.equal(ugandaPhone("+256772123456"), "+256772123456");
    assert.throws(() => readUgx("0"), /UGX/);
  });

  it("reports missing keys and builds official Transak and Coinbase requests", () => {
    assert.equal(kotaniStatus({}).configured, false);
    assert.deepEqual(kotaniStatus({ KOTANI_API_KEY: "test" }).missing, []);
    assert.equal(transakStatus({}).configured, false);
    assert.equal(transakStatus({ NEXT_PUBLIC_TRANSAK_API_KEY: "pk", TRANSAK_ACCESS_TOKEN: "secret" }).configured, true);
    assert.equal(coinbaseStatus({ COINBASE_CDP_API_KEY_NAME: "id" }).configured, false);
    const params = transakWidgetParams({
      apiKey: "pk",
      referrerDomain: "rvess.example",
      walletAddress: "0x4CC5313fCf12032aF023F099dC4af059Be466d7c",
      fiatAmount: 25,
    });
    assert.equal(params.network, "base");
    assert.equal(params.cryptoCurrencyCode, "USDC");
    assert.equal(params.disableWalletAddressForm, true);
    assert.equal(params.fiatAmount, 25);
    assert.equal(transakSessionEndpoint({}), "https://api-gateway.transak.com/api/v2/auth/session");
    assert.match(transakSessionEndpoint({ TRANSAK_ENV: "staging" }), /api-gateway-stg/);
    const target = coinbaseOnrampUrl("session-token", "0xabc");
    assert.match(target, /^https:\/\/pay\.coinbase\.com\/buy\/select-asset\?/);
    assert.match(target, /sessionToken=session-token/);
    assert.deepEqual(coinbaseTokenBody("0xabc"), {
      addresses: [{ address: "0xabc", blockchains: ["base"] }],
      assets: ["USDC"],
    });
  });

  it("signs a Coinbase CDP JWT that verifies with the matching P-256 key", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const token = coinbaseJwt("organizations/demo/apiKeys/abc", pem.replace(/\n/g, "\\n"), 1_700_000_000);
    const [headerPart, payloadPart, signaturePart] = token.split(".");
    const header = JSON.parse(Buffer.from(headerPart, "base64url").toString()) as { alg: string; kid: string; nonce: string };
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString()) as { sub: string; iss: string; exp: number; uri: string };
    assert.equal(header.alg, "ES256");
    assert.equal(header.kid, "organizations/demo/apiKeys/abc");
    assert.equal(header.nonce.length, 32);
    assert.equal(payload.sub, header.kid);
    assert.equal(payload.iss, "cdp");
    assert.equal(payload.exp, 1_700_000_120);
    assert.equal(payload.uri, "POST api.developer.coinbase.com/onramp/v1/token");
    const ok = verify(
      "sha256",
      Buffer.from(`${headerPart}.${payloadPart}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signaturePart, "base64url"),
    );
    assert.equal(ok, true);
  });
});
