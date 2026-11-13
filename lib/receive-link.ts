/** Pure receive-link types and helpers (safe for tests / client). */

export const streamModes = ["fixed", "flexible", "open"] as const;
export type StreamMode = (typeof streamModes)[number];

export const streamFrequencies = ["daily", "weekly", "monthly"] as const;
export type StreamFrequency = (typeof streamFrequencies)[number];

export type ReceiveSocials = {
  website?: string;
  twitter?: string;
  farcaster?: string;
  github?: string;
};

export type ReceiveLinkConfig = {
  address: string;
  enabled: boolean;
  streamEnabled: boolean;
  onceEnabled: boolean;
  streamMode: StreamMode;
  title: string;
  description: string;
  coverUrl: string;
  fundingGoal: string;
  anonymousOk: boolean;
  messagesOk: boolean;
  onceMin: string;
  onceMax: string;
  oncePresets: string[];
  streamAmount: string;
  streamFrequency: StreamFrequency;
  streamDurationDays: number;
  streamAmounts: string[];
  streamFrequencies: StreamFrequency[];
  streamDurations: number[];
  tokens: string[];
  networks: ("base" | "celo")[];
  wallet: string;
  socials: ReceiveSocials;
};

export type ReceiveIdentifierKind = "address" | "username" | "userId" | "invalid";

export type ClassifiedIdentifier =
  | { kind: "address"; value: string }
  | { kind: "username"; value: string }
  | { kind: "userId"; value: string }
  | { kind: "invalid"; reason: string };

const DAY = 86_400;

export function defaultReceiveConfig(address: string): ReceiveLinkConfig {
  return {
    address: address.toLowerCase(),
    enabled: true,
    streamEnabled: true,
    onceEnabled: true,
    streamMode: "open",
    title: "",
    description: "",
    coverUrl: "",
    fundingGoal: "",
    anonymousOk: true,
    messagesOk: true,
    onceMin: "1",
    onceMax: "",
    oncePresets: ["5", "10", "25", "50"],
    streamAmount: "10",
    streamFrequency: "monthly",
    streamDurationDays: 30,
    streamAmounts: ["5", "10", "25", "50"],
    streamFrequencies: ["daily", "weekly", "monthly"],
    streamDurations: [7, 30, 90],
    tokens: ["base-usdc", "celo-usdc", "base-usdt", "celo-usdt"],
    networks: ["base", "celo"],
    wallet: "",
    socials: {},
  };
}

/** Classify `/r/:identifier` before any database lookup. */
export function classifyIdentifier(raw: string): ClassifiedIdentifier {
  const value = raw.trim();
  if (!value) return { kind: "invalid", reason: "Enter a receive link." };
  if (value.length > 128) return { kind: "invalid", reason: "That link is too long." };

  if (value.startsWith("0x") || value.startsWith("0X")) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
      return { kind: "invalid", reason: "That wallet address is not valid." };
    }
    return { kind: "address", value: value.toLowerCase() };
  }

  if (/^\d{1,18}$/.test(value)) {
    return { kind: "userId", value };
  }

  if (/^[a-zA-Z0-9_]{3,32}$/.test(value)) {
    return { kind: "username", value: value.toLowerCase() };
  }

  return { kind: "invalid", reason: "That receive link is not valid." };
}

export function isStreamMode(value: string): value is StreamMode {
  return (streamModes as readonly string[]).includes(value);
}

export function isStreamFrequency(value: string): value is StreamFrequency {
  return (streamFrequencies as readonly string[]).includes(value);
}

export function periodSeconds(frequency: StreamFrequency): number {
  if (frequency === "daily") return DAY;
  if (frequency === "weekly") return 7 * DAY;
  return 30 * DAY;
}

export function frequencyLabel(frequency: StreamFrequency): string {
  if (frequency === "daily") return "Daily";
  if (frequency === "weekly") return "Weekly";
  return "Monthly";
}

/** Total USD commitment for a stream rate × duration. */
export function streamCommitment(rate: string, frequency: StreamFrequency, durationDays: number): string {
  const amount = Number(rate.replace(/,/g, "").trim());
  if (!Number.isFinite(amount) || amount <= 0 || durationDays <= 0) return "0";
  const periods = (durationDays * DAY) / periodSeconds(frequency);
  const total = amount * periods;
  if (!Number.isFinite(total) || total <= 0) return "0";
  return total >= 100 ? total.toFixed(0) : total.toFixed(2).replace(/\.00$/, "");
}

/** Duration seconds + total USD amount for existing vault `createFlow`. */
export function streamPlanAmounts(rate: string, frequency: StreamFrequency, durationDays: number): { amount: string; duration: number } {
  const duration = Math.round(durationDays) * DAY;
  const total = streamCommitment(rate, frequency, durationDays);
  return { amount: total, duration };
}

export function parseMoneyList(raw: string, fallback: string[]): string[] {
  const parts = raw
    .split(/[,|\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => /^\d+(\.\d{1,6})?$/.test(item) && Number(item) > 0);
  return parts.length ? Array.from(new Set(parts)).slice(0, 12) : fallback;
}

export function parseDayList(raw: string, fallback: number[]): number[] {
  const parts = raw
    .split(/[,|\s]+/)
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item >= 1 && item <= 3650);
  return parts.length ? Array.from(new Set(parts)).slice(0, 8) : fallback;
}

export function parseFrequencyList(raw: string, fallback: StreamFrequency[]): StreamFrequency[] {
  const parts = raw
    .split(/[,|\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(isStreamFrequency);
  return parts.length ? Array.from(new Set(parts)) : fallback;
}

export function moneyOk(value: string): boolean {
  return /^\d+(\.\d{1,6})?$/.test(value.replace(/,/g, "").trim()) && Number(value.replace(/,/g, "").trim()) > 0;
}

export function clampOnceAmount(amount: string, config: ReceiveLinkConfig): string | null {
  if (!moneyOk(amount)) return null;
  const n = Number(amount.replace(/,/g, "").trim());
  const min = Number(config.onceMin || "0");
  const max = config.onceMax ? Number(config.onceMax) : Infinity;
  if (Number.isFinite(min) && min > 0 && n < min) return null;
  if (Number.isFinite(max) && max > 0 && n > max) return null;
  return amount.replace(/,/g, "").trim();
}

export function receivingWallet(config: ReceiveLinkConfig): string {
  const wallet = config.wallet.trim();
  return wallet || config.address;
}

export function truncateAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export type ReceiveFundingStats = {
  supporters: number;
  receivedUsd: string;
  committedUsd: string;
};

export function emptyFundingStats(): ReceiveFundingStats {
  return { supporters: 0, receivedUsd: "0", committedUsd: "0" };
}
