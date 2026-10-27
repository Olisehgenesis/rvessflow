import type { Address, Hex } from "viem";

export type PasskeyRecord = {
  id: string;
  publicKey: Hex;
  address: Address;
  label: string;
};

/** What the browser returns from a passkey prompt. The public key is not in here. */
export type PasskeyProof = {
  id: string;
  authenticatorData: Hex;
  clientDataJSON: string;
  signature: Hex;
};

export function samePasskeyId(left: string, right: string): boolean {
  return canon(left) === canon(right);
}

function canon(id: string): string {
  return id.trim().replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
