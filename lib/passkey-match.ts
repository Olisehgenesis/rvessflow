import { p256 } from "@noble/curves/p256";
import { Bytes, Hash, Hex, P256, PublicKey } from "ox";
import type { Hex as ViemHex } from "viem";
import type { PasskeyProof } from "@/lib/passkey-proof";

/** True when this passkey prompt was signed by the P256 key stored for a Kernel account. */
export function passkeySignedBy(x: bigint, y: bigint, proof: PasskeyProof, rpId: string): boolean {
  if (x <= 0n || y <= 0n) return false;
  let client: { type?: string; challenge?: string };
  try {
    client = JSON.parse(proof.clientDataJSON) as { type?: string; challenge?: string };
  } catch {
    return false;
  }
  if (client.type !== "webauthn.get" || !client.challenge) return false;
  const authenticatorData = Bytes.fromHex(proof.authenticatorData);
  if (authenticatorData.length < 37) return false;
  if ((authenticatorData[32] & 0x01) !== 0x01) return false;
  const rpHash = authenticatorData.slice(0, 32);
  const expected = Hash.sha256(Hex.fromString(rpId), { as: "Bytes" });
  if (!Bytes.isEqual(rpHash, expected)) return false;
  const clientHash = Hash.sha256(Bytes.fromString(proof.clientDataJSON), { as: "Bytes" });
  const payload = Bytes.concat(authenticatorData, clientHash);
  let signature: { r: bigint; s: bigint };
  try {
    const parsed = p256.Signature.fromDER(Hex.toBytes(proof.signature)).normalizeS();
    signature = { r: parsed.r, s: parsed.s };
  } catch {
    return false;
  }
  return P256.verify({
    hash: true,
    payload,
    publicKey: PublicKey.from({ prefix: 4, x, y }),
    signature,
  });
}

/** The public key that signed this prompt. WebAuthn does not return it, so it is recovered from the signature. */
export function recoverSigningKey(proof: PasskeyProof, rpId: string): { x: bigint; y: bigint } | null {
  const payload = signedPayload(proof, rpId);
  if (!payload) return null;
  let parsed: ReturnType<typeof p256.Signature.fromDER>;
  try {
    parsed = p256.Signature.fromDER(Hex.toBytes(proof.signature));
  } catch {
    return null;
  }
  const hash = Hash.sha256(payload, { as: "Bytes" });
  for (const recovery of [0, 1, 2, 3] as const) {
    try {
      const point = parsed.addRecoveryBit(recovery).recoverPublicKey(hash);
      const x = point.x;
      const y = point.y;
      if (typeof x !== "bigint" || typeof y !== "bigint") continue;
      const low = parsed.normalizeS();
      const ok = P256.verify({
        hash: true,
        payload,
        publicKey: PublicKey.from({ prefix: 4, x, y }),
        signature: { r: low.r, s: low.s },
      });
      if (ok) return { x, y };
    } catch {
      // This recovery id does not produce a key for this signature.
    }
  }
  return null;
}

function signedPayload(proof: PasskeyProof, rpId: string): Uint8Array | null {
  let client: { type?: string; challenge?: string };
  try {
    client = JSON.parse(proof.clientDataJSON) as { type?: string; challenge?: string };
  } catch {
    return null;
  }
  if (client.type !== "webauthn.get" || !client.challenge) return null;
  const authenticatorData = Bytes.fromHex(proof.authenticatorData);
  if (authenticatorData.length < 37) return null;
  if ((authenticatorData[32] & 0x01) !== 0x01) return null;
  const expected = Hash.sha256(Hex.fromString(rpId), { as: "Bytes" });
  if (!Bytes.isEqual(authenticatorData.slice(0, 32), expected)) return null;
  const clientHash = Hash.sha256(Bytes.fromString(proof.clientDataJSON), { as: "Bytes" });
  return Bytes.concat(authenticatorData, clientHash);
}

export function publicKeyHex(x: bigint, y: bigint): ViemHex {
  return PublicKey.toHex(PublicKey.from({ prefix: 4, x, y }), { includePrefix: false }) as ViemHex;
}

export function passkeySignedByHex(publicKey: ViemHex, proof: PasskeyProof, rpId: string): boolean {
  try {
    const key = PublicKey.fromHex(publicKey);
    if (typeof key.y !== "bigint") return false;
    return passkeySignedBy(key.x, key.y, proof, rpId);
  } catch {
    return false;
  }
}
