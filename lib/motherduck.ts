import "server-only";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql, type SQL } from "drizzle-orm";
import pg from "pg";

const host = process.env.MOTHERDUCK_HOST || "pg.us-east-1-aws.motherduck.com";
const database = process.env.MOTHERDUCK_DB || "beta";

const globalPool = globalThis as unknown as { rvessMotherDuck?: pg.Pool; rvessMotherDuckDb?: NodePgDatabase };

function pool() {
  const token = process.env.MOTHERDUCK_TOKEN;
  if (!token) throw new Error("MotherDuck is not configured.");
  globalPool.rvessMotherDuck ??= new pg.Pool({
    host,
    port: 5432,
    user: "postgres",
    password: token,
    database,
    ssl: { rejectUnauthorized: true },
    max: 3,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 5000,
  });
  return globalPool.rvessMotherDuck;
}

export function db() {
  globalPool.rvessMotherDuckDb ??= drizzle(pool());
  return globalPool.rvessMotherDuckDb;
}

export function asRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray((result as { rows: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

export async function rows<T>(statement: SQL): Promise<T[]> {
  return asRows<T>(await db().execute(statement));
}

export async function transaction<T>(run: (query: <R>(statement: SQL) => Promise<R[]>) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  const database = drizzle(client);
  const query = async <R>(statement: SQL) => asRows<R>(await database.execute(statement));
  try {
    await client.query("BEGIN");
    const value = await run(query);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export { sql };
