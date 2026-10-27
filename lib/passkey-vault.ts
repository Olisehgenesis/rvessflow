"use client";

import { rememberPasskey } from "@/lib/passkey-cookie";
import type { PasskeyRecord } from "@/lib/passkey-proof";

export type SavedPasskey = PasskeyRecord;

const DB = "rvess-passkeys";
const STORE = "crypto";
const SEAL = "seal";
const LOCAL = "rvess-passkey-vault";
const PLAIN = "rvess-passkey-records";
const RECORDS = "records";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the passkey store."));
  });
}

function idbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error ?? new Error("Could not read the passkey store."));
  });
}

function idbSet(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not write the passkey store."));
  });
}

async function existingSeal(): Promise<CryptoKey | null> {
  try {
    const db = await openDb();
    return (await idbGet<CryptoKey>(db, SEAL)) ?? null;
  } catch {
    return null;
  }
}

function b64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function readable(value: unknown): SavedPasskey[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is SavedPasskey => {
    if (!item || typeof item !== "object") return false;
    const record = item as SavedPasskey;
    return typeof record.id === "string" && record.id.length > 0
      && typeof record.publicKey === "string" && record.publicKey.length > 10
      && typeof record.address === "string" && /^0x[a-fA-F0-9]{40}$/.test(record.address)
      && typeof record.label === "string";
  });
}

function readPlain(): SavedPasskey[] {
  try {
    const raw = localStorage.getItem(PLAIN);
    if (!raw) return [];
    return readable(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

function writePlain(records: SavedPasskey[]) {
  localStorage.setItem(PLAIN, JSON.stringify(records));
}

async function readIndexed(): Promise<SavedPasskey[]> {
  try {
    const db = await openDb();
    const raw = await idbGet<string>(db, RECORDS);
    if (typeof raw !== "string") return [];
    return readable(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

async function readEncrypted(): Promise<SavedPasskey[]> {
  const raw = localStorage.getItem(LOCAL);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as { iv?: string; data?: string };
  if (!parsed.iv || !parsed.data) return [];
  const key = await existingSeal();
  if (!key) return [];
  const iv = b64ToBytes(parsed.iv);
  const data = b64ToBytes(parsed.data);
  const opened = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    data as BufferSource,
  );
  return readable(JSON.parse(new TextDecoder().decode(opened)) as unknown);
}

function merge(groups: SavedPasskey[][]): SavedPasskey[] {
  const byAddress = new Map<string, SavedPasskey>();
  for (const group of groups) {
    for (const record of group) byAddress.set(record.address.toLowerCase(), record);
  }
  return [...byAddress.values()];
}

export async function readPasskeys(): Promise<SavedPasskey[]> {
  const plain = readPlain();
  const indexed = await readIndexed();
  let encrypted: SavedPasskey[] = [];
  if (plain.length === 0 && indexed.length === 0) {
    try {
      encrypted = await readEncrypted();
    } catch {
      encrypted = [];
    }
  }
  const records = merge([plain, indexed, encrypted]);
  if (records.length > 0 && (plain.length === 0 || indexed.length === 0)) {
    writePlain(records);
    await writeIndexed(records);
  }
  return records;
}

async function writeIndexed(records: SavedPasskey[]) {
  try {
    const db = await openDb();
    await idbSet(db, RECORDS, JSON.stringify(records));
  } catch {
    // Site storage can be blocked. The cookie copy is written separately.
  }
}

async function writePasskeys(records: SavedPasskey[]) {
  writePlain(records);
  await writeIndexed(records);
}

export async function savePasskey(record: SavedPasskey) {
  const current = await readPasskeys().catch(() => [] as SavedPasskey[]);
  const next = current.filter((item) => item.address.toLowerCase() !== record.address.toLowerCase());
  next.push(record);
  await writePasskeys(next);
  await rememberPasskey(record).catch(() => undefined);
}
