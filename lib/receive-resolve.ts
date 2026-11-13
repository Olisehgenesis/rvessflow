import "server-only";

import { getAddress, isAddress, type Address } from "viem";
import { rows, sql } from "@/lib/motherduck";
import { loadIdentity } from "@/lib/good-identity";
import { ensureSchema } from "@/lib/records";
import {
  classifyIdentifier,
  defaultReceiveConfig,
  emptyFundingStats,
  receivingWallet,
  truncateAddress,
  type ReceiveFundingStats,
  type ReceiveLinkConfig,
} from "@/lib/receive-link";
import { loadReceiveFunding, loadReceiveLink } from "@/lib/receive-store";

export type PublicReceiveProfile = {
  address: Address;
  name: string;
  username: string;
  verified: boolean;
  registered: boolean;
  description: string;
  coverUrl: string;
  title: string;
  socials: ReceiveLinkConfig["socials"];
};

export type ResolveOutcome =
  | {
      status: "ok";
      profile: PublicReceiveProfile;
      config: ReceiveLinkConfig;
      funding: ReceiveFundingStats;
      payTo: Address;
    }
  | { status: "invalid"; reason: string }
  | { status: "not_found"; reason: string }
  | {
      status: "disabled";
      profile: PublicReceiveProfile;
      config: ReceiveLinkConfig;
      reason: string;
    };

async function profileByAddress(address: Address): Promise<{ name: string; memberCode: string } | null> {
  await ensureSchema();
  const key = address.toLowerCase();
  const found = await rows<{ name: string; member_code: string }>(
    sql`SELECT name, member_code FROM app.profiles WHERE lower(address) = ${key}
        UNION ALL
        SELECT name, member_code FROM demo.profiles WHERE lower(address) = ${key}
        LIMIT 1`,
  );
  const row = found[0];
  if (!row) return null;
  return { name: row.name || "", memberCode: row.member_code || "" };
}

async function addressByMemberCode(code: string): Promise<Address | null> {
  await ensureSchema();
  const key = code.toLowerCase();
  const found = await rows<{ address: string }>(
    sql`SELECT address FROM app.profiles WHERE lower(member_code) = ${key}
        UNION ALL
        SELECT address FROM demo.profiles WHERE lower(member_code) = ${key}
        LIMIT 1`,
  );
  const hit = found[0]?.address;
  if (!hit || !isAddress(hit)) return null;
  return getAddress(hit);
}

async function addressByUserId(id: string): Promise<Address | null> {
  // Numeric identifiers resolve as member codes first (codes may be numeric).
  const byCode = await addressByMemberCode(id);
  if (byCode) return byCode;
  return null;
}

async function addressByUsername(username: string): Promise<Address | null> {
  const byCode = await addressByMemberCode(username);
  if (byCode) return byCode;

  await ensureSchema();
  // Fallback: unique display-name slug (spaces → none, lowercased).
  const found = await rows<{ address: string; name: string }>(
    sql`SELECT address, name FROM app.profiles WHERE lower(replace(name, ' ', '')) = ${username}
        UNION ALL
        SELECT address, name FROM demo.profiles WHERE lower(replace(name, ' ', '')) = ${username}
        LIMIT 2`,
  );
  if (found.length !== 1) return null;
  const hit = found[0]?.address;
  if (!hit || !isAddress(hit)) return null;
  return getAddress(hit);
}

async function buildProfile(address: Address, registered: boolean): Promise<PublicReceiveProfile> {
  const saved = registered ? await profileByAddress(address) : null;
  const identity = await loadIdentity(address).catch(() => null);
  const config = await loadReceiveLink(address).catch(() => defaultReceiveConfig(address));
  const name = saved?.name && saved.name !== "Wallet" ? saved.name : truncateAddress(address);
  const username = saved?.memberCode || "";
  return {
    address,
    name,
    username,
    verified: Boolean(identity?.verified),
    registered,
    description: config.description,
    coverUrl: config.coverUrl,
    title: config.title,
    socials: config.socials,
  };
}

/** Public resolver for `/r/:identifier`. Never requires authentication. */
export async function resolveReceiveIdentifier(raw: string): Promise<ResolveOutcome> {
  const classified = classifyIdentifier(raw);
  if (classified.kind === "invalid") {
    return { status: "invalid", reason: classified.reason };
  }

  let address: Address | null = null;
  let registered = false;

  try {
    if (classified.kind === "address") {
      address = getAddress(classified.value);
      const saved = await profileByAddress(address);
      registered = Boolean(saved);
    } else if (classified.kind === "userId") {
      address = await addressByUserId(classified.value);
      registered = Boolean(address);
      if (!address) {
        return { status: "not_found", reason: "No account uses that ID." };
      }
    } else {
      address = await addressByUsername(classified.value);
      registered = Boolean(address);
      if (!address) {
        return { status: "not_found", reason: "No account uses that username." };
      }
    }
  } catch {
    if (classified.kind === "address" && isAddress(classified.value)) {
      address = getAddress(classified.value);
      registered = false;
    } else {
      return { status: "not_found", reason: "The member directory is unavailable right now." };
    }
  }

  if (!address) {
    return { status: "not_found", reason: "That receive link could not be resolved." };
  }

  let config: ReceiveLinkConfig;
  let funding: ReceiveFundingStats;
  try {
    config = await loadReceiveLink(address);
    funding = await loadReceiveFunding(address);
  } catch {
    config = defaultReceiveConfig(address);
    funding = emptyFundingStats();
  }

  const profile = await buildProfile(address, registered);
  if (config.description) profile.description = config.description;
  if (config.title) profile.title = config.title;
  if (config.coverUrl) profile.coverUrl = config.coverUrl;
  profile.socials = config.socials;

  const wallet = receivingWallet(config);
  const payTo = isAddress(wallet) ? getAddress(wallet) : address;

  if (!config.enabled || (!config.streamEnabled && !config.onceEnabled)) {
    return {
      status: "disabled",
      profile,
      config,
      reason: "This receive link is not accepting contributions right now.",
    };
  }

  return { status: "ok", profile, config, funding, payTo };
}
