import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isFrequency, type Frequency } from "@/lib/intent";
import { rows, sql } from "@/lib/motherduck";
import { people } from "@/lib/protocol";

export type GoalNote = {
  description: string;
  frequency: Frequency;
  paused: boolean;
};

export type ActivityRecord = {
  id: string;
  owner: string;
  title: string;
  detail: string;
  direction: "in" | "out";
  amount: string;
  asset: "usdcx" | "ethx";
  at: number;
  href: string;
};

type FileStore = {
  goals: Record<string, GoalNote>;
  activity: ActivityRecord[];
};

const filePath = path.join(process.cwd(), "data", "local-store.json");
let queue: Promise<unknown> = Promise.resolve();

function locked<T>(run: () => Promise<T>): Promise<T> {
  const next = queue.then(run, run);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function key(owner: string, id: string) {
  return `${owner.toLowerCase()}:${id}`;
}

function bucketFor(owner: string) {
  return people().some((person) => person.address.toLowerCase() === owner.toLowerCase()) ? "demo" : "app";
}

function dbReady() {
  return Boolean(process.env.MOTHERDUCK_TOKEN);
}

async function readFileStore(): Promise<FileStore> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as Partial<FileStore>;
    return {
      goals: parsed.goals ?? {},
      activity: Array.isArray(parsed.activity) ? parsed.activity : [],
    };
  } catch {
    return { goals: {}, activity: [] };
  }
}

async function writeFileStore(store: FileStore) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(store));
}

let schemaReady: Promise<void> | null = null;

function ensureTables() {
  schemaReady ??= (async () => {
    for (const bucket of ["demo", "app"]) {
      await rows(sql.raw(`CREATE SCHEMA IF NOT EXISTS ${bucket}`));
      await rows(
        sql.raw(
          `CREATE TABLE IF NOT EXISTS ${bucket}.goal_notes (owner VARCHAR NOT NULL, flow_id VARCHAR NOT NULL, description VARCHAR NOT NULL, frequency VARCHAR NOT NULL, paused BOOLEAN NOT NULL, PRIMARY KEY (owner, flow_id))`,
        ),
      );
      await rows(
        sql.raw(
          `CREATE TABLE IF NOT EXISTS ${bucket}.activity_feed (id VARCHAR PRIMARY KEY, owner VARCHAR NOT NULL, title VARCHAR NOT NULL, detail VARCHAR NOT NULL, direction VARCHAR NOT NULL, amount VARCHAR NOT NULL, asset VARCHAR NOT NULL, at VARCHAR NOT NULL, href VARCHAR NOT NULL)`,
        ),
      );
    }
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

function noteFrom(row: { description?: string; frequency?: string; paused?: boolean }): GoalNote {
  return {
    description: (row.description ?? "").slice(0, 280),
    frequency: row.frequency && isFrequency(row.frequency) ? row.frequency : "Monthly",
    paused: Boolean(row.paused),
  };
}

export async function goalNotes(owner: string): Promise<Record<string, GoalNote>> {
  if (!dbReady()) {
    const store = await readFileStore();
    const notes: Record<string, GoalNote> = {};
    const prefix = `${owner.toLowerCase()}:`;
    for (const [id, note] of Object.entries(store.goals)) {
      if (id.startsWith(prefix)) notes[id.slice(prefix.length)] = noteFrom(note);
    }
    return notes;
  }
  try {
    await ensureTables();
    const table = sql.raw(`${bucketFor(owner)}.goal_notes`);
    const found = await rows<{ flow_id: string; description: string; frequency: string; paused: boolean }>(
      sql`SELECT flow_id, description, frequency, paused FROM ${table} WHERE lower(owner) = ${owner.toLowerCase()}`,
    );
    const notes: Record<string, GoalNote> = {};
    for (const row of found) notes[row.flow_id] = noteFrom(row);
    return notes;
  } catch {
    return goalNotesFile(owner);
  }
}

async function goalNotesFile(owner: string) {
  const store = await readFileStore();
  const notes: Record<string, GoalNote> = {};
  const prefix = `${owner.toLowerCase()}:`;
  for (const [id, note] of Object.entries(store.goals)) {
    if (id.startsWith(prefix)) notes[id.slice(prefix.length)] = noteFrom(note);
  }
  return notes;
}

export async function saveGoalNote(owner: string, flowId: string, note: GoalNote) {
  const clean = noteFrom(note);
  if (!dbReady()) {
    await locked(async () => {
      const store = await readFileStore();
      store.goals[key(owner, flowId)] = clean;
      await writeFileStore(store);
    });
    return;
  }
  try {
    await ensureTables();
    const table = sql.raw(`${bucketFor(owner)}.goal_notes`);
    await rows(sql`DELETE FROM ${table} WHERE lower(owner) = ${owner.toLowerCase()} AND flow_id = ${flowId}`);
    await rows(
      sql`INSERT INTO ${table} (owner, flow_id, description, frequency, paused) VALUES (${owner}, ${flowId}, ${clean.description}, ${clean.frequency}, ${clean.paused})`,
    );
  } catch {
    await locked(async () => {
      const store = await readFileStore();
      store.goals[key(owner, flowId)] = clean;
      await writeFileStore(store);
    });
  }
}

export async function patchGoalNote(owner: string, flowId: string, patch: Partial<GoalNote>) {
  const current = (await goalNotes(owner))[flowId] ?? { description: "", frequency: "Monthly" as Frequency, paused: false };
  await saveGoalNote(owner, flowId, {
    description: patch.description ?? current.description,
    frequency: patch.frequency ?? current.frequency,
    paused: patch.paused ?? current.paused,
  });
}

export async function listActivity(owner: string): Promise<ActivityRecord[]> {
  if (!dbReady()) return (await readFileStore()).activity.filter((item) => item.owner.toLowerCase() === owner.toLowerCase());
  try {
    await ensureTables();
    const table = sql.raw(`${bucketFor(owner)}.activity_feed`);
    const found = await rows<ActivityRecord & { at: string }>(
      sql`SELECT id, owner, title, detail, direction, amount, asset, at, href FROM ${table} WHERE lower(owner) = ${owner.toLowerCase()} ORDER BY at DESC LIMIT 100`,
    );
    return found.map((row) => ({ ...row, at: Number(row.at) || 0, direction: row.direction === "out" ? "out" : "in", asset: row.asset === "ethx" ? "ethx" : "usdcx" }));
  } catch {
    return (await readFileStore()).activity.filter((item) => item.owner.toLowerCase() === owner.toLowerCase());
  }
}

export async function recordActivity(entry: ActivityRecord) {
  const row: ActivityRecord = {
    ...entry,
    owner: entry.owner,
    title: entry.title.slice(0, 80),
    detail: entry.detail.slice(0, 120),
    href: entry.href.slice(0, 160),
  };
  if (!dbReady()) {
    await locked(async () => {
      const store = await readFileStore();
      store.activity = [row, ...store.activity.filter((item) => item.id !== row.id)].slice(0, 400);
      await writeFileStore(store);
    });
    return;
  }
  try {
    await ensureTables();
    const table = sql.raw(`${bucketFor(row.owner)}.activity_feed`);
    await rows(sql`DELETE FROM ${table} WHERE id = ${row.id}`);
    await rows(
      sql`INSERT INTO ${table} (id, owner, title, detail, direction, amount, asset, at, href) VALUES (${row.id}, ${row.owner}, ${row.title}, ${row.detail}, ${row.direction}, ${row.amount}, ${row.asset}, ${String(row.at)}, ${row.href})`,
    );
  } catch {
    await locked(async () => {
      const store = await readFileStore();
      store.activity = [row, ...store.activity.filter((item) => item.id !== row.id)].slice(0, 400);
      await writeFileStore(store);
    });
  }
}
