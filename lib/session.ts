import "server-only";

import { cookies } from "next/headers";
import { isAddress, type Address } from "viem";
import { people } from "@/lib/protocol";
import { currencyByCode } from "@/lib/quote";

const WHO = "rvess-account";
const IN = "rvess-in";
const CURRENCY = "rvess-currency";
const ADDR = "rvess-address";
const METHOD = "rvess-auth";
const LABEL = "rvess-label";

export type AuthMethod = "passkey" | "wallet" | "tester";

export type Viewer = {
  address: Address;
  name: string;
  method: AuthMethod;
  index: number;
};

const cookie = { httpOnly: true, sameSite: "lax" as const, path: "/" };

function testerAt(index: number): Viewer {
  const roster = people();
  const person = roster[index];
  if (!person) throw new Error("That account is not one of the funded test accounts.");
  return { address: person.address, name: person.name, method: "tester", index };
}

export async function viewer(): Promise<Viewer> {
  const jar = await cookies();
  const method = jar.get(METHOD)?.value;
  const address = jar.get(ADDR)?.value;
  if ((method === "passkey" || method === "wallet") && address && isAddress(address)) {
    const roster = people();
    const index = roster.findIndex((person) => person.address.toLowerCase() === address.toLowerCase());
    const fallback = method === "passkey" ? "Passkey" : "Wallet";
    const name = jar.get(LABEL)?.value?.trim() || fallback;
    return { address, name, method, index };
  }
  const count = people().length;
  const value = Number(jar.get(WHO)?.value ?? "0");
  const index = Number.isInteger(value) && value >= 0 && value < count ? value : 0;
  return testerAt(index);
}

export async function accountIndex(): Promise<number> {
  const who = await viewer();
  if (who.method !== "tester" || who.index < 0) {
    throw new Error("This account signs with your passkey or wallet. Switch to a funded test account in Settings to send from this machine.");
  }
  return who.index;
}

export async function hasEntered(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(IN)?.value === "1";
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
  jar.set(ADDR, address, cookie);
  jar.set(METHOD, method, cookie);
  jar.set(LABEL, label.slice(0, 32), cookie);
  jar.set(IN, "1", cookie);
  jar.delete(WHO);
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
}

export async function currencyCode(): Promise<string> {
  const jar = await cookies();
  return currencyByCode(jar.get(CURRENCY)?.value ?? "fusdcx").code;
}

export async function rememberCurrency(code: string) {
  const jar = await cookies();
  jar.set(CURRENCY, currencyByCode(code).code, cookie);
}
