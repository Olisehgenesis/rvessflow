import "server-only";

import { getAddress } from "viem";
import { rows, sql } from "@/lib/motherduck";
import { people } from "@/lib/protocol";
import { ensureSchema } from "@/lib/records";
import { acceptedTerms, viewer } from "@/lib/session";
import { decideTour, TOUR_VERSION, type TourRow, type TourSource, type TourStatus } from "@/lib/tour-eligibility";

type Bucket = "demo" | "app";

function bucketFor(address: string): Bucket {
  return people().some((person) => person.address.toLowerCase() === address.toLowerCase()) ? "demo" : "app";
}

function table(bucket: Bucket) {
  return sql.raw(`${bucket}.onboarding`);
}

function asStatus(value: string): TourStatus | null {
  if (value === "pending" || value === "complete" || value === "skipped") return value;
  return null;
}

async function readRow(address: string): Promise<TourRow | null> {
  await ensureSchema();
  const bucket = bucketFor(address);
  const found = await rows<{ status: string; step: number; version: number }>(
    sql`SELECT status, step, version FROM ${table(bucket)} WHERE lower(address) = ${address.toLowerCase()} LIMIT 1`,
  );
  const row = found[0];
  if (!row) return null;
  const status = asStatus(row.status);
  if (!status) return null;
  return { status, step: Number(row.step) || 0, version: Number(row.version) || TOUR_VERSION };
}

async function writeRow(address: string, status: TourStatus, step: number, source: TourSource) {
  await ensureSchema();
  const bucket = bucketFor(address);
  const now = new Date().toISOString();
  const key = getAddress(address);
  await rows(
    sql`DELETE FROM ${table(bucket)} WHERE lower(address) = ${key.toLowerCase()}`,
  );
  await rows(
    sql`INSERT INTO ${table(bucket)} (address, status, step, version, source, updated_at) VALUES (${key}, ${status}, ${step}, ${TOUR_VERSION}, ${source}, ${now})`,
  );
}

export type TourView = { eligible: boolean; step: number };

export async function resolveTour(input: { hasStarted: boolean }): Promise<TourView> {
  try {
    const [who, termsAccepted] = await Promise.all([viewer(), acceptedTerms()]);
    const row = await readRow(who.address);
    const decision = decideTour({
      method: who.method,
      needsName: who.needsName,
      termsAccepted,
      hasStarted: input.hasStarted,
      row,
    });
    if (decision.write) {
      await writeRow(who.address, decision.write.status, decision.write.step, decision.write.source);
      if (decision.write.source === "auto" && decision.eligible) {
        const { captureServerEvent } = await import("@/lib/posthog-server");
        await captureServerEvent(who.address, "onboarding_started", { version: TOUR_VERSION });
      }
    }
    return { eligible: decision.eligible, step: decision.step };
  } catch {
    return { eligible: false, step: 0 };
  }
}

export async function saveTourStep(step: number) {
  const who = await viewer();
  const row = await readRow(who.address);
  if (row?.status !== "pending") return;
  await writeRow(who.address, "pending", Math.max(0, Math.floor(step)), "auto");
}

export async function skipTour() {
  const who = await viewer();
  await writeRow(who.address, "skipped", 0, "skip");
  const { captureServerEvent } = await import("@/lib/posthog-server");
  await captureServerEvent(who.address, "onboarding_skipped", { version: TOUR_VERSION });
}

export async function finishTour() {
  const who = await viewer();
  await writeRow(who.address, "complete", 0, "finish");
  const { captureServerEvent } = await import("@/lib/posthog-server");
  await captureServerEvent(who.address, "onboarding_completed", { version: TOUR_VERSION });
}

export async function restartTourRecord() {
  const who = await viewer();
  await writeRow(who.address, "pending", 0, "restart");
  const { captureServerEvent } = await import("@/lib/posthog-server");
  await captureServerEvent(who.address, "onboarding_restarted", { version: TOUR_VERSION });
}
