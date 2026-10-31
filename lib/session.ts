import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAddress, type Address } from "viem";
import { people } from "@/lib/protocol";
import { currencyForCountry } from "@/lib/place";
import { currencyByCode } from "@/lib/quote";

const WHO = "rvess-account";
const IN = "rvess-in";
const CURRENCY = "rvess-currency";
const ADDR = "rvess-address";
const METHOD = "rvess-auth";
const LABEL = "rvess-label";
const TERMS = "rvess-terms";

export type AuthMethod = "passkey" | "wallet" | "tester";

export type Viewer = {
  address: Address;
  name: string;
  method: AuthMethod;
  index: number;
  needsName: boolean;
};

export function displayName(method: AuthMethod, label: string | undefined): { name: string; needsName: boolean } {
  const trimmed = label?.trim() ?? "";
  if (method === "wallet" && (trimmed === "" || trimmed === "Wallet")) return { name: "Wallet", needsName: true };
  if (!trimmed) return { name: method === "passkey" ? "Passkey" : "Wallet", needsName: false };
  return { name: trimmed.slice(0, 32), needsName: false };
}

const year = 60 * 60 * 24 * 400;
const cookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: year,
  secure: process.env.NODE_ENV === "production",
};

function testerAt(index: number): Viewer {
  const roster = people();
  const person = roster[index];
  if (!person) throw new Error("That account is not one of the funded test accounts.");
  return { address: person.address, name: person.name, method: "tester", index, needsName: false };
}

export async function viewer(): Promise<Viewer> {
  const jar = await cookies();
  const method = jar.get(METHOD)?.value;
  const address = jar.get(ADDR)?.value;
  if ((method === "passkey" || method === "wallet") && address && isAddress(address)) {
    const roster = people();
    const index = roster.findIndex((person) => person.address.toLowerCase() === address.toLowerCase());
    const shown = displayName(method, jar.get(LABEL)?.value);
    return { address, name: shown.name, method, index, needsName: shown.needsName };
  }
  const count = people().length;
  const value = Number(jar.get(WHO)?.value ?? "0");
  const index = Number.isInteger(value) && value >= 0 && value < count ? value : 0;
  if (count === 0) {
    // Production has no tester keys. A leftover tester cookie must not crash every signed-in page.
    redirect("/session-gone");
  }
  return testerAt(index);
}

export async function accountIndex(): Promise<number> {
  const who = await viewer();
  if (who.method !== "tester" || who.index < 0) {
    throw new Error("This sign-in does not use a test key. Confirm the payment on this device.");
  }
  return who.index;
}

export async function hasEntered(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(IN)?.value === "1";
}

export async function acceptedTerms(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(TERMS)?.value === "1";
}

export async function rememberTerms() {
  const jar = await cookies();
  jar.set(TERMS, "1", cookie);
}

export async function rememberTester(index: number) {
  const who = testerAt(index);
  const jar = await cookies();
  jar.set(WHO, String(who.index), cookie);
  jar.set(ADDR, who.address, cookie);
  jar.set(METHOD, "tester", cookie);
  jar.set(LABEL, who.name, cookie);
  jar.set(IN, "1", cookie);
}

export async function rememberWallet(address: Address, method: "passkey" | "wallet", label: string) {
  const jar = await cookies();
  const previousAddress = jar.get(ADDR)?.value ?? "";
  const same = previousAddress.toLowerCase() === address.toLowerCase();
  const kept = displayName(method, same ? jar.get(LABEL)?.value : "");
  const incoming = label.trim().slice(0, 32);
  const unnamed = method === "wallet" && (incoming === "" || incoming === "Wallet");
  const name = unnamed ? (kept.needsName ? "" : kept.name) : incoming;
  jar.set(ADDR, address, cookie);
  jar.set(METHOD, method, cookie);
  jar.set(LABEL, name, cookie);
  jar.set(IN, "1", cookie);
  jar.delete(WHO);
}

export async function rememberName(name: string) {
  const who = await viewer();
  if (who.method !== "wallet") return;
  const next = name.trim().slice(0, 32);
  if (!next || next === "Wallet") return;
  const jar = await cookies();
  jar.set(LABEL, next, cookie);
}

export async function rememberAccount(index: number) {
  await rememberTester(index);
}

export async function rememberEntry() {
  const jar = await cookies();
  jar.set(IN, "1", cookie);
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(WHO);
  jar.delete(IN);
  jar.delete(ADDR);
  jar.delete(METHOD);
  jar.delete(LABEL);
  jar.delete(TERMS);
}

async function requestCountry(): Promise<string | null> {
  const country = (await headers()).get("x-vercel-ip-country");
  if (!country || country === "XX") return null;
  return country;
}

export async function currencyChoice(): Promise<string | null> {
  const saved = (await cookies()).get(CURRENCY)?.value;
  return saved ? currencyByCode(saved).code : null;
}

export async function placeIsKnown(): Promise<boolean> {
  if (await currencyChoice()) return true;
  return currencyForCountry(await requestCountry()) !== null;
}

export async function currencyCode(): Promise<string> {
  const chosen = await currencyChoice();
  if (chosen) return chosen;
  return currencyForCountry(await requestCountry()) ?? "usd";
}

export async function rememberCurrency(code: string) {
  const jar = await cookies();
  jar.set(CURRENCY, currencyByCode(code).code, cookie);
}
