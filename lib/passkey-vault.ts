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

function bytesToB64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function b64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function readPasskeys(): Promise<SavedPasskey[]> {
  const raw = localStorage.getItem(LOCAL);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as { iv?: string; data?: string };
  if (!parsed.iv || !parsed.data) return [];
  const key = await sealKey();
  const iv = b64ToBytes(parsed.iv);
  const data = b64ToBytes(parsed.data);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    data as BufferSource,
  );
  const records = JSON.parse(new TextDecoder().decode(plain)) as SavedPasskey[];
  return Array.isArray(records) ? records : [];
}

async function writePasskeys(records: SavedPasskey[]) {
  const key = await sealKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(records)),
  );
  localStorage.setItem(
    LOCAL,
    JSON.stringify({ iv: bytesToB64(iv), data: bytesToB64(new Uint8Array(cipher)) }),
  );
}

export async function savePasskey(record: SavedPasskey) {
  const current = await readPasskeys().catch(() => [] as SavedPasskey[]);
  const next = current.filter((item) => item.address.toLowerCase() !== record.address.toLowerCase());
  next.push(record);
  await writePasskeys(next);
}
