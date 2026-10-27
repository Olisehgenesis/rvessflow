"use server";

import { cookies } from "next/headers";
import { getAddress, isAddress, type Hex } from "viem";
import type { PasskeyRecord } from "@/lib/passkey-proof";
import { samePasskeyId } from "@/lib/passkey-proof";

const NAME = "rvess-passkeys";
const MAX = 6;

const cookie = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 400 };

function readable(value: unknown): PasskeyRecord[] {
  if (!Array.isArray(value)) return [];
  const records: PasskeyRecord[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as PasskeyRecord;
    if (typeof record.id !== "string" || record.id.length < 8) continue;
    if (typeof record.publicKey !== "string" || !/^0x[0-9a-fA-F]{128}$/.test(record.publicKey)) continue;
    if (typeof record.address !== "string" || !isAddress(record.address)) continue;
    if (typeof record.label !== "string") continue;
    records.push({
      id: record.id,
      publicKey: record.publicKey as Hex,
      address: getAddress(record.address),
      label: record.label.trim().slice(0, 32) || "Passkey",
    });
  }
  return records;
}

async function readCookie(): Promise<PasskeyRecord[]> {
  const jar = await cookies();
  const raw = jar.get(NAME)?.value;
  if (!raw) return [];
  try {
    return readable(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

/** Keeps the passkey's public key in a cookie so sign-in still works if site storage is cleared. */
export async function rememberPasskey(record: PasskeyRecord): Promise<void> {
  const [kept] = readable([record]);
  if (!kept) return;
  const current = await readCookie();
  const next = current.filter((item) => item.address.toLowerCase() !== kept.address.toLowerCase());
  next.push(kept);
  const jar = await cookies();
  jar.set(NAME, JSON.stringify(next.slice(-MAX)), cookie);
}

export async function passkeyFromCookie(id: string): Promise<PasskeyRecord | null> {
  const records = await readCookie();
  return records.find((item) => samePasskeyId(item.id, id)) ?? null;
}
