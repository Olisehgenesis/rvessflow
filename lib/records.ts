import "server-only";

import { randomBytes } from "node:crypto";
import { rows, sql, transaction } from "@/lib/motherduck";
import { people } from "@/lib/protocol";
import { viewer } from "@/lib/session";
import { subjectKinds, type GroupProfile, type Milestone, type SubjectKind } from "@/lib/savings";

type Bucket = "demo" | "app";

const buckets: Bucket[] = ["demo", "app"];
const refPattern = /^[a-z0-9:._-]{1,80}$/i;

function bucketFor(address: string): Bucket {
  return people().some((person) => person.address.toLowerCase() === address.toLowerCase()) ? "demo" : "app";
}

function raw(bucket: Bucket, name: "profiles" | "drafts" | "group_profiles" | "milestones") {
  return `${bucket}.${name}`;
}

let schema: Promise<void> | null = null;

export function ensureSchema() {
  schema ??= applySchema().catch((error) => {
    schema = null;
    throw error;
  });
  return schema;
}

const tableSql = (bucket: Bucket) => [
  `CREATE SCHEMA IF NOT EXISTS ${bucket}`,
  `CREATE TABLE IF NOT EXISTS ${bucket}.profiles (address VARCHAR PRIMARY KEY, name VARCHAR NOT NULL, email VARCHAR NOT NULL DEFAULT '', password VARCHAR NOT NULL DEFAULT '', member_code VARCHAR DEFAULT '', id_status VARCHAR DEFAULT 'none', kin_name VARCHAR DEFAULT '', kin_contact VARCHAR DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS ${bucket}.phones (address VARCHAR NOT NULL, phone VARCHAR NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (address, phone))`,
  `CREATE TABLE IF NOT EXISTS ${bucket}.drafts (id VARCHAR PRIMARY KEY, creator VARCHAR NOT NULL, contribution VARCHAR NOT NULL, cycles INTEGER NOT NULL, cycle VARCHAR NOT NULL, days VARCHAR NOT NULL, is_open BOOLEAN NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ${bucket}.draft_members (draft_id VARCHAR NOT NULL, position INTEGER NOT NULL, address VARCHAR NOT NULL, PRIMARY KEY (draft_id, position))`,
  `CREATE TABLE IF NOT EXISTS ${bucket}.applications (draft_id VARCHAR NOT NULL, address VARCHAR NOT NULL, name VARCHAR NOT NULL, PRIMARY KEY (draft_id, address))`,
  `CREATE TABLE IF NOT EXISTS ${bucket}.group_profiles (ref VARCHAR PRIMARY KEY, creator VARCHAR NOT NULL, name VARCHAR NOT NULL, purpose VARCHAR NOT NULL, rules VARCHAR NOT NULL, require_id BOOLEAN NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ${bucket}.milestones (id VARCHAR PRIMARY KEY, owner VARCHAR NOT NULL, subject_kind VARCHAR NOT NULL, subject_ref VARCHAR NOT NULL, position INTEGER NOT NULL, label VARCHAR NOT NULL, amount VARCHAR NOT NULL DEFAULT '', rate_per_day VARCHAR NOT NULL DEFAULT '', days INTEGER NOT NULL DEFAULT 0, reached BOOLEAN NOT NULL DEFAULT false)`,
];

async function addColumn(bucket: Bucket, table: "profiles" | "drafts", column: string, definition: string) {
  if (!/^[a-z_]+$/.test(column)) throw new Error("Unexpected column.");
  try {
    await rows(sql.raw(`ALTER TABLE ${bucket}.${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/already exists|duplicate column/i.test(message)) return;
    throw error;
  }
}

async function applySchema() {
  await rows(sql.raw(`CREATE SCHEMA IF NOT EXISTS app`));
  await rows(sql.raw(`CREATE TABLE IF NOT EXISTS app.meta (key VARCHAR PRIMARY KEY, value VARCHAR NOT NULL)`));
  for (const bucket of buckets) {
    for (const statement of tableSql(bucket)) await rows(sql.raw(statement));
    await addColumn(bucket, "profiles", "member_code", "VARCHAR DEFAULT ''");
    await addColumn(bucket, "profiles", "id_status", "VARCHAR DEFAULT 'none'");
    await addColumn(bucket, "profiles", "kin_name", "VARCHAR DEFAULT ''");
    await addColumn(bucket, "profiles", "kin_contact", "VARCHAR DEFAULT ''");
    await addColumn(bucket, "drafts", "plain", "BOOLEAN DEFAULT false");
    await addColumn(bucket, "drafts", "name", "VARCHAR DEFAULT ''");
    await addColumn(bucket, "drafts", "description", "VARCHAR DEFAULT ''");
    await addColumn(bucket, "drafts", "code", "VARCHAR DEFAULT ''");
    await addColumn(bucket, "drafts", "network", "VARCHAR DEFAULT 'base'");
    await addColumn(bucket, "drafts", "token", "VARCHAR DEFAULT 'usd'");
    await rows(sql.raw(`CREATE TABLE IF NOT EXISTS ${bucket}.group_labels (ref VARCHAR PRIMARY KEY, name VARCHAR NOT NULL, description VARCHAR NOT NULL, code VARCHAR NOT NULL)`));
    await rows(
      sql.raw(
        `CREATE TABLE IF NOT EXISTS ${raw(bucket, "group_profiles")} (ref VARCHAR PRIMARY KEY, creator VARCHAR NOT NULL, name VARCHAR NOT NULL, purpose VARCHAR NOT NULL, rules VARCHAR NOT NULL, require_id BOOLEAN NOT NULL)`,
      ),
    );
    await rows(
      sql.raw(
        `CREATE TABLE IF NOT EXISTS ${raw(bucket, "milestones")} (id VARCHAR PRIMARY KEY, owner VARCHAR NOT NULL, subject_kind VARCHAR NOT NULL, subject_ref VARCHAR NOT NULL, position INTEGER NOT NULL, label VARCHAR NOT NULL, amount VARCHAR NOT NULL DEFAULT '', rate_per_day VARCHAR NOT NULL DEFAULT '', days INTEGER NOT NULL DEFAULT 0, reached BOOLEAN NOT NULL DEFAULT false)`,
      ),
    );
  }
}

export async function readGroupProfile(ref: string): Promise<GroupProfile | null> {
  await ensureSchema();
  const key = cleanRef(ref);
  for (const bucket of buckets) {
    const found = await rows<{ ref: string; creator: string; name: string; purpose: string; rules: string; require_id: boolean }>(
      sql`SELECT ref, creator, name, purpose, rules, require_id FROM ${sql.raw(raw(bucket, "group_profiles"))} WHERE ref = ${key}`,
    );
    const row = found[0];
    if (!row) continue;
    return {
      ref: row.ref,
      creator: row.creator,
      name: row.name,
      purpose: row.purpose,
      rules: row.rules,
      requireId: Boolean(row.require_id),
    };
  }
  return null;
}

export async function saveGroupProfile(input: { ref: string; name: string; purpose: string; rules: string; requireId: boolean }) {
  await ensureSchema();
  const who = await viewer();
  const key = cleanRef(input.ref);
  const name = input.name.trim();
  const purpose = input.purpose.trim();
  const rules = input.rules.trim();
  if (!name || name.length > 48) throw new Error("Give the group a name, up to 48 characters.");
  if (purpose.length > 280) throw new Error("Keep the purpose to 280 characters.");
  if (rules.length > 2000) throw new Error("Keep the rules to 2000 characters.");
  const bucket = bucketFor(who.address);
  const table = sql.raw(raw(bucket, "group_profiles"));
  const existing = await rows<{ creator: string }>(sql`SELECT creator FROM ${table} WHERE ref = ${key}`);
  if (existing[0] && existing[0].creator.toLowerCase() !== who.address.toLowerCase()) {
    throw new Error("Only the person who wrote this group profile can change it.");
  }
  await transaction(async (query) => {
    await query(sql`DELETE FROM ${table} WHERE ref = ${key}`);
    await query(
      sql`INSERT INTO ${table} (ref, creator, name, purpose, rules, require_id) VALUES (${key}, ${who.address}, ${name}, ${purpose}, ${rules}, ${input.requireId})`,
    );
  });
}

export async function readMilestones(subjectKind: SubjectKind, subjectRef: string): Promise<Milestone[]> {
  await ensureSchema();
  const kind = cleanKind(subjectKind);
  const ref = cleanRef(subjectRef);
  const found: Milestone[] = [];
  for (const bucket of buckets) {
    const rowsFound = await rows<{
      id: string;
      owner: string;
      subject_kind: string;
      subject_ref: string;
      position: unknown;
      label: string;
      amount: string;
      rate_per_day: string;
      days: unknown;
      reached: boolean;
    }>(
      sql`SELECT id, owner, subject_kind, subject_ref, position, label, amount, rate_per_day, days, reached FROM ${sql.raw(raw(bucket, "milestones"))} WHERE subject_kind = ${kind} AND subject_ref = ${ref} ORDER BY position`,
    );
    for (const row of rowsFound) {
      const subject = cleanKind(row.subject_kind);
      found.push({
        id: row.id,
        owner: row.owner,
        subjectKind: subject,
        subjectRef: row.subject_ref,
        position: Number(row.position) || 0,
        label: row.label,
        amount: row.amount ?? "",
        ratePerDay: row.rate_per_day ?? "",
        days: Number(row.days) || 0,
        reached: Boolean(row.reached),
      });
    }
  }
  return found.sort((left, right) => left.position - right.position);
}

export async function saveMilestones(subjectKind: SubjectKind, subjectRef: string, drafts: MilestoneDraft[]) {
  await ensureSchema();
  const who = await viewer();
  const kind = cleanKind(subjectKind);
  const ref = cleanRef(subjectRef);
  if (drafts.length > 12) throw new Error("A plan can have 12 milestones.");
  const bucket = bucketFor(who.address);
  const table = sql.raw(raw(bucket, "milestones"));
  const milestones = drafts.map((draft, position) => checkMilestone(draft, position));
  await transaction(async (query) => {
    await query(sql`DELETE FROM ${table} WHERE owner = ${who.address} AND subject_kind = ${kind} AND subject_ref = ${ref}`);
    for (const milestone of milestones) {
      await query(
        sql`INSERT INTO ${table} (id, owner, subject_kind, subject_ref, position, label, amount, rate_per_day, days, reached) VALUES (${milestone.id}, ${who.address}, ${kind}, ${ref}, ${milestone.position}, ${milestone.label}, ${milestone.amount}, ${milestone.ratePerDay}, ${milestone.days}, ${milestone.reached})`,
      );
    }
  });
}

export type MilestoneDraft = {
  id?: string;
  label: string;
  amount?: string;
  ratePerDay?: string;
  days?: number;
  reached?: boolean;
};

function checkMilestone(draft: MilestoneDraft, position: number) {
  const label = draft.label.trim();
  if (!label || label.length > 48) throw new Error("Each milestone needs a label, up to 48 characters.");
  const amount = (draft.amount ?? "").trim();
  const ratePerDay = (draft.ratePerDay ?? "").trim();
  const days = Number(draft.days ?? 0);
  const amountSet = amount.length > 0;
  const rateSet = ratePerDay.length > 0;
  if (amountSet === rateSet) throw new Error("A milestone is either an amount or a daily rate.");
  if (amountSet && !/^\d+(\.\d{1,18})?$/.test(amount)) throw new Error("Enter the milestone amount as a number.");
  if (rateSet && (!/^\d+(\.\d{1,18})?$/.test(ratePerDay) || !Number.isInteger(days) || days < 1 || days > 3660)) {
    throw new Error("A rate milestone needs the amount per day and how many days it has to hold.");
  }
  if (amountSet && days !== 0) throw new Error("An amount milestone does not take a number of days.");
  const id = draft.id && /^[a-f0-9]{16}$/.test(draft.id) ? draft.id : randomBytes(8).toString("hex");
  return { id, position, label, amount: amountSet ? amount : "", ratePerDay: rateSet ? ratePerDay : "", days: amountSet ? 0 : days, reached: Boolean(draft.reached) };
}

function cleanKind(value: string): SubjectKind {
  if ((subjectKinds as readonly string[]).includes(value)) return value as SubjectKind;
  throw new Error("That milestone does not belong to a saving, a lock, a stream, a joint goal, or a pool.");
}

function cleanRef(value: string) {
  const ref = value.trim();
  if (!refPattern.test(ref)) throw new Error("That reference is not usable.");
  return ref;
}
