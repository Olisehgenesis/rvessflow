"use client";

import type { Address, Hex } from "viem";

export type SavedPasskey = {
  id: string;
  publicKey: Hex;
  address: Address;
  label: string;
};

const DB = "rvess-passkeys";
const STORE = "crypto";
const SEAL = "seal";
const LOCAL = "rvess-passkey-vault";
const PLAIN = "rvess-passkey-records";

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

function idbGet(db: IDBDatabase): Promise<CryptoKey | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(SEAL);
    request.onsuccess = () => resolve(request.result as CryptoKey | undefined);
    request.onerror = () => reject(request.error ?? new Error("Could not read the passkey store."));
  });
}

function idbSet(db: IDBDatabase, key: CryptoKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(key, SEAL);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not write the passkey store."));
  });
}

async function sealKey(): Promise<CryptoKey> {
  const db = await openDb();
  const existing = await idbGet(db);
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await idbSet(db, key);
  return key;
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

export async function readPasskeys(): Promise<SavedPasskey[]> {
  const plain = readPlain();
  if (plain.length > 0) return plain;
  const raw = localStorage.getItem(LOCAL);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as { iv?: string; data?: string };
  if (!parsed.iv || !parsed.data) return [];
  const key = await sealKey();
  const iv = b64ToBytes(parsed.iv);
  const data = b64ToBytes(parsed.data);
  const opened = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    data as BufferSource,
  );
  const records = readable(JSON.parse(new TextDecoder().decode(opened)) as unknown);
  if (records.length > 0) writePlain(records);
  return records;
}

async function writePasskeys(records: SavedPasskey[]) {
  writePlain(records);
}

export async function savePasskey(record: SavedPasskey) {
  const current = await readPasskeys().catch(() => [] as SavedPasskey[]);
  const next = current.filter((item) => item.address.toLowerCase() !== record.address.toLowerCase());
  next.push(record);
  await writePasskeys(next);
}
