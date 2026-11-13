import "server-only";

import { getAddress, isAddress, type Address } from "viem";
import { rows, sql } from "@/lib/motherduck";
import { people } from "@/lib/protocol";
import {
  defaultReceiveConfig,
  isStreamFrequency,
  isStreamMode,
  parseDayList,
  parseFrequencyList,
  parseMoneyList,
  type ReceiveLinkConfig,
  type ReceiveSocials,
  type StreamFrequency,
  type StreamMode,
} from "@/lib/receive-link";
import { ensureSchema } from "@/lib/records";

type Bucket = "demo" | "app";

const buckets: Bucket[] = ["demo", "app"];

function bucketFor(address: string): Bucket {
  return people().some((person) => person.address.toLowerCase() === address.toLowerCase()) ? "demo" : "app";
}

let receiveSchema: Promise<void> | null = null;

export function ensureReceiveSchema() {
  receiveSchema ??= applyReceiveSchema().catch((error) => {
    receiveSchema = null;
    throw error;
  });
  return receiveSchema;
}

async function applyReceiveSchema() {
  await ensureSchema();
  for (const bucket of buckets) {
    await rows(
      sql.raw(
        `CREATE TABLE IF NOT EXISTS ${bucket}.receive_links (
          address VARCHAR PRIMARY KEY,
          enabled BOOLEAN NOT NULL DEFAULT true,
          stream_enabled BOOLEAN NOT NULL DEFAULT true,
          once_enabled BOOLEAN NOT NULL DEFAULT true,
          stream_mode VARCHAR NOT NULL DEFAULT 'open',
          title VARCHAR NOT NULL DEFAULT '',
          description VARCHAR NOT NULL DEFAULT '',
          cover_url VARCHAR NOT NULL DEFAULT '',
          funding_goal VARCHAR NOT NULL DEFAULT '',
          anonymous_ok BOOLEAN NOT NULL DEFAULT true,
          messages_ok BOOLEAN NOT NULL DEFAULT true,
          once_min VARCHAR NOT NULL DEFAULT '1',
          once_max VARCHAR NOT NULL DEFAULT '',
          once_presets VARCHAR NOT NULL DEFAULT '5,10,25,50',
          stream_amount VARCHAR NOT NULL DEFAULT '10',
          stream_frequency VARCHAR NOT NULL DEFAULT 'monthly',
          stream_duration_days INTEGER NOT NULL DEFAULT 30,
          stream_amounts VARCHAR NOT NULL DEFAULT '5,10,25,50',
          stream_frequencies VARCHAR NOT NULL DEFAULT 'daily,weekly,monthly',
          stream_durations VARCHAR NOT NULL DEFAULT '7,30,90',
          tokens VARCHAR NOT NULL DEFAULT 'base-usdc,celo-usdc,base-usdt,celo-usdt,celo-gdx',
          networks VARCHAR NOT NULL DEFAULT 'base,celo',
          wallet VARCHAR NOT NULL DEFAULT '',
          socials VARCHAR NOT NULL DEFAULT '{}',
          updated_at VARCHAR NOT NULL DEFAULT ''
        )`,
      ),
    );
    await rows(
      sql.raw(
        `CREATE TABLE IF NOT EXISTS ${bucket}.receive_events (
          id VARCHAR PRIMARY KEY,
          recipient VARCHAR NOT NULL,
          contributor VARCHAR NOT NULL DEFAULT '',
          kind VARCHAR NOT NULL,
          amount VARCHAR NOT NULL DEFAULT '0',
          token VARCHAR NOT NULL DEFAULT '',
          network VARCHAR NOT NULL DEFAULT '',
          anonymous BOOLEAN NOT NULL DEFAULT false,
          message VARCHAR NOT NULL DEFAULT '',
          tx_hash VARCHAR NOT NULL DEFAULT '',
          created_at VARCHAR NOT NULL
        )`,
      ),
    );
  }
}

type Row = {
  address: string;
  enabled: boolean;
  stream_enabled: boolean;
  once_enabled: boolean;
  stream_mode: string;
  title: string;
  description: string;
  cover_url: string;
  funding_goal: string;
  anonymous_ok: boolean;
  messages_ok: boolean;
  once_min: string;
  once_max: string;
  once_presets: string;
  stream_amount: string;
  stream_frequency: string;
  stream_duration_days: number;
  stream_amounts: string;
  stream_frequencies: string;
  stream_durations: string;
  tokens: string;
  networks: string;
  wallet: string;
  socials: string;
};

function parseSocials(raw: string): ReceiveSocials {
  try {
    const parsed = JSON.parse(raw || "{}") as ReceiveSocials;
    return {
      website: typeof parsed.website === "string" ? parsed.website.slice(0, 200) : undefined,
      twitter: typeof parsed.twitter === "string" ? parsed.twitter.slice(0, 80) : undefined,
      farcaster: typeof parsed.farcaster === "string" ? parsed.farcaster.slice(0, 80) : undefined,
      github: typeof parsed.github === "string" ? parsed.github.slice(0, 80) : undefined,
    };
  } catch {
    return {};
  }
}

function fromRow(row: Row): ReceiveLinkConfig {
  const base = defaultReceiveConfig(row.address);
  const mode: StreamMode = isStreamMode(row.stream_mode) ? row.stream_mode : "open";
  const frequency: StreamFrequency = isStreamFrequency(row.stream_frequency) ? row.stream_frequency : "monthly";
  const networks = row.networks
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is "base" | "celo" => item === "base" || item === "celo");
  return {
    ...base,
    address: row.address.toLowerCase(),
    enabled: Boolean(row.enabled),
    streamEnabled: Boolean(row.stream_enabled),
    onceEnabled: Boolean(row.once_enabled),
    streamMode: mode,
    title: (row.title ?? "").slice(0, 80),
    description: (row.description ?? "").slice(0, 500),
    coverUrl: (row.cover_url ?? "").slice(0, 300),
    fundingGoal: (row.funding_goal ?? "").slice(0, 32),
    anonymousOk: Boolean(row.anonymous_ok),
    messagesOk: Boolean(row.messages_ok),
    onceMin: row.once_min || "1",
    onceMax: row.once_max || "",
    oncePresets: parseMoneyList(row.once_presets, base.oncePresets),
    streamAmount: row.stream_amount || "10",
    streamFrequency: frequency,
    streamDurationDays: Number(row.stream_duration_days) > 0 ? Number(row.stream_duration_days) : 30,
    streamAmounts: parseMoneyList(row.stream_amounts, base.streamAmounts),
    streamFrequencies: parseFrequencyList(row.stream_frequencies, base.streamFrequencies),
    streamDurations: parseDayList(row.stream_durations, base.streamDurations),
    tokens: row.tokens
      ? row.tokens
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 16)
      : base.tokens,
    networks: networks.length ? networks : base.networks,
    wallet: row.wallet && isAddress(row.wallet) ? getAddress(row.wallet) : "",
    socials: parseSocials(row.socials),
  };
}

export async function loadReceiveLink(address: Address): Promise<ReceiveLinkConfig> {
  await ensureReceiveSchema();
  const key = address.toLowerCase();
  for (const bucket of buckets) {
    const found = await rows<Row>(
      sql`SELECT * FROM ${sql.raw(`${bucket}.receive_links`)} WHERE lower(address) = ${key} LIMIT 1`,
    );
    if (found[0]) return fromRow(found[0]);
  }
  return defaultReceiveConfig(key);
}

export async function saveReceiveLink(owner: Address, input: Partial<ReceiveLinkConfig>): Promise<ReceiveLinkConfig> {
  await ensureReceiveSchema();
  const current = await loadReceiveLink(owner);
  const next: ReceiveLinkConfig = {
    ...current,
    ...input,
    address: owner.toLowerCase(),
    title: (input.title ?? current.title).slice(0, 80),
    description: (input.description ?? current.description).slice(0, 500),
    coverUrl: (input.coverUrl ?? current.coverUrl).slice(0, 300),
    fundingGoal: (input.fundingGoal ?? current.fundingGoal).slice(0, 32),
    onceMin: input.onceMin ?? current.onceMin,
    onceMax: input.onceMax ?? current.onceMax,
    streamAmount: input.streamAmount ?? current.streamAmount,
    streamFrequency: input.streamFrequency ?? current.streamFrequency,
    streamDurationDays: input.streamDurationDays ?? current.streamDurationDays,
    oncePresets: input.oncePresets ?? current.oncePresets,
    streamAmounts: input.streamAmounts ?? current.streamAmounts,
    streamFrequencies: input.streamFrequencies ?? current.streamFrequencies,
    streamDurations: input.streamDurations ?? current.streamDurations,
    tokens: input.tokens ?? current.tokens,
    networks: input.networks ?? current.networks,
    wallet: input.wallet && isAddress(input.wallet) ? getAddress(input.wallet) : input.wallet === "" ? "" : current.wallet,
    socials: input.socials ?? current.socials,
    streamMode: input.streamMode ?? current.streamMode,
    enabled: input.enabled ?? current.enabled,
    streamEnabled: input.streamEnabled ?? current.streamEnabled,
    onceEnabled: input.onceEnabled ?? current.onceEnabled,
    anonymousOk: input.anonymousOk ?? current.anonymousOk,
    messagesOk: input.messagesOk ?? current.messagesOk,
  };

  const bucket = bucketFor(owner);
  const table = sql.raw(`${bucket}.receive_links`);
  const now = new Date().toISOString();
  await rows(sql`DELETE FROM ${table} WHERE lower(address) = ${owner.toLowerCase()}`);
  await rows(sql`
    INSERT INTO ${table} (
      address, enabled, stream_enabled, once_enabled, stream_mode, title, description, cover_url, funding_goal,
      anonymous_ok, messages_ok, once_min, once_max, once_presets, stream_amount, stream_frequency, stream_duration_days,
      stream_amounts, stream_frequencies, stream_durations, tokens, networks, wallet, socials, updated_at
    ) VALUES (
      ${getAddress(owner)},
      ${next.enabled},
      ${next.streamEnabled},
      ${next.onceEnabled},
      ${next.streamMode},
      ${next.title},
      ${next.description},
      ${next.coverUrl},
      ${next.fundingGoal},
      ${next.anonymousOk},
      ${next.messagesOk},
      ${next.onceMin},
      ${next.onceMax},
      ${next.oncePresets.join(",")},
      ${next.streamAmount},
      ${next.streamFrequency},
      ${next.streamDurationDays},
      ${next.streamAmounts.join(",")},
      ${next.streamFrequencies.join(",")},
      ${next.streamDurations.join(",")},
      ${next.tokens.join(",")},
      ${next.networks.join(",")},
      ${next.wallet},
      ${JSON.stringify(next.socials)},
      ${now}
    )
  `);
  return next;
}

export async function recordReceiveEvent(input: {
  recipient: Address;
  contributor: string;
  kind: "once" | "stream";
  amount: string;
  token: string;
  network: string;
  anonymous: boolean;
  message: string;
  txHash?: string;
}) {
  await ensureReceiveSchema();
  const bucket = bucketFor(input.recipient);
  const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  await rows(sql`
    INSERT INTO ${sql.raw(`${bucket}.receive_events`)} (
      id, recipient, contributor, kind, amount, token, network, anonymous, message, tx_hash, created_at
    ) VALUES (
      ${id},
      ${getAddress(input.recipient)},
      ${input.anonymous ? "" : input.contributor.slice(0, 64)},
      ${input.kind},
      ${input.amount.slice(0, 32)},
      ${input.token.slice(0, 32)},
      ${input.network.slice(0, 16)},
      ${input.anonymous},
      ${input.message.slice(0, 280)},
      ${(input.txHash ?? "").slice(0, 80)},
      ${new Date().toISOString()}
    )
  `);
}

export async function loadReceiveFunding(recipient: Address): Promise<{
  supporters: number;
  receivedUsd: string;
  committedUsd: string;
}> {
  await ensureReceiveSchema();
  const key = recipient.toLowerCase();
  let supporters = 0;
  let received = 0;
  let committed = 0;
  const seen = new Set<string>();
  for (const bucket of buckets) {
    const found = await rows<{ contributor: string; kind: string; amount: string; anonymous: boolean }>(
      sql`SELECT contributor, kind, amount, anonymous FROM ${sql.raw(`${bucket}.receive_events`)} WHERE lower(recipient) = ${key}`,
    );
    for (const row of found) {
      const who = row.anonymous ? `anon:${row.amount}:${row.kind}` : row.contributor.toLowerCase() || `anon:${supporters}`;
      if (!seen.has(who)) {
        seen.add(who);
        supporters += 1;
      }
      const n = Number(row.amount);
      if (!Number.isFinite(n)) continue;
      if (row.kind === "once") received += n;
      else committed += n;
    }
  }
  return {
    supporters,
    receivedUsd: received > 0 ? received.toFixed(2).replace(/\.00$/, "") : "0",
    committedUsd: committed > 0 ? committed.toFixed(2).replace(/\.00$/, "") : "0",
  };
}
