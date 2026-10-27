import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Bytes, Hash, Hex, P256 } from "ox";
import { passkeySignedBy, publicKeyHex, recoverSigningKey } from "@/lib/passkey-match";
import { samePasskeyId } from "@/lib/passkey-proof";
import type { PasskeyProof } from "@/lib/passkey-proof";

describe("passkey ids", () => {
  it("treats base64 padding and url characters as the same id", () => {
    assert.equal(samePasskeyId("abc+", "abc-"), true);
    assert.equal(samePasskeyId("abc/", "abc_"), true);
    assert.equal(samePasskeyId("abc=", "abc"), true);
    assert.equal(samePasskeyId("abc", "abd"), false);
  });
});

describe("passkey signature", () => {
  it("accepts the key that signed the prompt and rejects a different key", () => {
    const rpId = "rvessflow.vercel.app";
    const one = P256.createKeyPair();
    const other = P256.createKeyPair();
    const authenticatorData = Bytes.concat(Hash.sha256(Hex.fromString(rpId), { as: "Bytes" }), new Uint8Array([0x01, 0, 0, 0, 0]));
    const clientDataJSON = JSON.stringify({ type: "webauthn.get", challenge: "abc", origin: "https://rvessflow.vercel.app" });
    const clientHash = Hash.sha256(Bytes.fromString(clientDataJSON), { as: "Bytes" });
    const payload = Bytes.concat(authenticatorData, clientHash);
    const signature = P256.sign({ hash: true, payload, privateKey: one.privateKey });
    const proof: PasskeyProof = {
      id: "credential",
      authenticatorData: Hex.fromBytes(authenticatorData),
      clientDataJSON,
      signature: "0x00",
    };
    const signed = { ...proof, signature: der(signature.r, signature.s) };
    assert.equal(passkeySignedBy(one.publicKey.x, one.publicKey.y, signed, rpId), true);
    assert.equal(passkeySignedBy(other.publicKey.x, other.publicKey.y, signed, rpId), false);
    const hex = publicKeyHex(one.publicKey.x, one.publicKey.y);
    assert.match(hex, /^0x[0-9a-f]{128}$/);
    const recovered = recoverSigningKey(signed, rpId);
    assert.ok(recovered);
    assert.equal(recovered.x, one.publicKey.x);
    assert.equal(recovered.y, one.publicKey.y);
  });
});

function der(r: bigint, s: bigint): `0x${string}` {
  const body = (value: bigint) => {
    let hex = value.toString(16).padStart(64, "0");
    if (Number.parseInt(hex[0], 16) >= 8) hex = `00${hex}`;
    return `02${(hex.length / 2).toString(16).padStart(2, "0")}${hex}`;
  };
  const sequence = `${body(r)}${body(s)}`;
  return `0x30${(sequence.length / 2).toString(16).padStart(2, "0")}${sequence}`;
}
