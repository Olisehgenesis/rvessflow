"use server";

import { accountKey } from "@/lib/protocol";
import { viewer } from "@/lib/session";

/** Returns the signed-in test account's key. Does not refresh the page. */
export async function revealAccountKey(): Promise<{ key: string } | { error: string }> {
  const who = await viewer();
  if (who.method !== "tester" || who.index < 0) {
    return { error: "This sign-in does not keep a key in the app." };
  }
  const key = accountKey(who.index, who.address);
  if (!key) return { error: "This account has no key on this machine." };
  return { key };
}
