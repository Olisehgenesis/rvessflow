import { createSign, randomBytes } from "node:crypto";

const tokenUri = "POST api.developer.coinbase.com/onramp/v1/token";

export function normalizePem(value: string): string {
  const trimmed = value.trim().replace(/^["']|["']$/g, "");
  return trimmed.includes("\\n") ? trimmed.replace(/\\n/g, "\n") : trimmed;
}

/** DER ECDSA signature to the raw R||S form ES256 JWTs use. */
export function derToJose(der: Buffer): Buffer {
  if (der[0] !== 0x30) throw new Error("The Coinbase key signature was not DER.");
  let offset = 2;
  if (der[1] & 0x80) offset = 2 + (der[1] & 0x7f);
  if (der[offset] !== 0x02) throw new Error("The Coinbase key signature was not DER.");
  const rLen = der[offset + 1];
  let r = der.subarray(offset + 2, offset + 2 + rLen);
  const sAt = offset + 2 + rLen;
  if (der[sAt] !== 0x02) throw new Error("The Coinbase key signature was not DER.");
  const sLen = der[sAt + 1];
  let s = der.subarray(sAt + 2, sAt + 2 + sLen);
  if (r[0] === 0) r = r.subarray(1);
  if (s[0] === 0) s = s.subarray(1);
  if (r.length > 32 || s.length > 32) throw new Error("The Coinbase key signature was the wrong size.");
  const out = Buffer.alloc(64);
  r.copy(out, 32 - r.length);
  s.copy(out, 64 - s.length);
  return out;
}

function b64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

/**
 * CDP ES256 JWT for the Onramp session-token API.
 * `keyName` is the secret API key id (`kid` and `sub`). `pem` is the EC private key.
 */
export function coinbaseJwt(keyName: string, pem: string, now = Math.floor(Date.now() / 1000)): string {
  const header = { alg: "ES256", kid: keyName, nonce: randomBytes(16).toString("hex"), typ: "JWT" };
  const payload = { sub: keyName, iss: "cdp", nbf: now, exp: now + 120, uri: tokenUri };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  const jose = derToJose(signer.sign(normalizePem(pem)));
  return `${signingInput}.${jose.toString("base64url")}`;
}
