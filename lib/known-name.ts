import "server-only";

import type { Address } from "viem";
import { savedDisplayName } from "@/lib/circle";
import { chosenName } from "@/lib/display";
import { onchainDisplayName } from "@/lib/onchain-name";
import { passkeyLabelFor } from "@/lib/passkey-cookie";

/** A name this wallet already has: the profile, this device's passkey, or an on-chain name. */
export async function knownDisplayName(address: Address): Promise<string | null> {
  const saved = await savedDisplayName(address);
  if (saved) return saved;
  const passkey = chosenName(await passkeyLabelFor(address).catch(() => null));
  if (passkey) return passkey;
  return onchainDisplayName(address);
}
