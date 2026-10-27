"use client";

import { createPublicClient, getAddress, http, isAddress, toCoinType, type Address } from "viem";
import { base, mainnet } from "viem/chains";

const client = createPublicClient({
  chain: mainnet,
  transport: http("https://ethereum.publicnode.com", { timeout: 8_000 }),
});
const baseCoin = toCoinType(base.id);

export type WalletIdentity = {
  address: Address;
  basename: string | null;
  label: string | null;
  avatar: string | null;
};

function usableAvatar(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("https://") || value.startsWith("data:image/")) return value;
  return null;
}

export function looksLikeName(value: string) {
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/i.test(value.trim());
}

async function profile(address: Address, name: string | null): Promise<WalletIdentity> {
  if (!name) return { address, basename: null, label: null, avatar: null };
  const [avatar, label] = await Promise.all([
    client.getEnsAvatar({ name }).catch(() => null),
    client.getEnsText({ name, key: "name" }).catch(() => null),
  ]);
  const clean = label?.trim() || null;
  return {
    address,
    basename: name,
    label: clean && clean.toLowerCase() !== name.toLowerCase() ? clean : null,
    avatar: usableAvatar(avatar),
  };
}

const cache = new Map<string, Promise<WalletIdentity | null>>();

export function lookupWallet(input: string): Promise<WalletIdentity | null> {
  const key = input.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = resolve(input.trim());
  cache.set(key, pending);
  return pending;
}

async function resolve(input: string): Promise<WalletIdentity | null> {
  try {
    if (isAddress(input)) {
      const address = getAddress(input);
      const basename = await client.getEnsName({ address, coinType: baseCoin }).catch(() => null);
      const other = basename ? null : await client.getEnsName({ address }).catch(() => null);
      return profile(address, basename || other);
    }
    if (!looksLikeName(input)) return null;
    const named = input.toLowerCase();
    const address = await client
      .getEnsAddress({ name: input, ...(named.endsWith(".base.eth") ? { coinType: baseCoin } : {}) })
      .catch(() => null);
    if (!address) return null;
    const basename = await client.getEnsName({ address, coinType: baseCoin }).catch(() => null);
    return profile(address, basename || input);
  } catch {
    return isAddress(input) ? { address: getAddress(input), basename: null, label: null, avatar: null } : null;
  }
}
