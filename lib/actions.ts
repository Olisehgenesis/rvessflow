"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAddress, isAddress, type Address } from "viem";
import {
  addToGoal,
  explain,
  groupAct,
  lockBreak,
  lockMature,
  lockTopUp,
  openGroup,
  openLock,
  openSaving,
  openStream,
  releaseGoal,
  vaultCall,
} from "@/lib/protocol";
import { cyclePlan } from "@/lib/cycle";
import { accountIndex, clearSession, rememberCurrency, rememberTester, rememberWallet } from "@/lib/session";

export type ActionState = { error: string } | null;

function refresh() {
  revalidatePath("/", "layout");
}

export async function enterApp() {
  await rememberTester(0);
  redirect("/home");
}

export async function openSession(address: string, method: "passkey" | "wallet", label: string) {
  if ((method !== "passkey" && method !== "wallet") || !isAddress(address)) {
    throw new Error("That sign-in could not be saved.");
  }
  const name = label.trim().slice(0, 32) || (method === "passkey" ? "Passkey" : "Wallet");
  await rememberWallet(getAddress(address), method, name);
  redirect("/home");
}

export async function signOut() {
  await clearSession();
  redirect("/");
}

export async function switchAccount(formData: FormData) {
  const index = Number(formData.get("index"));
  await rememberTester(index);
  refresh();
}

export async function setCurrency(formData: FormData) {
  await rememberCurrency(String(formData.get("currency") ?? "fusdcx"));
  refresh();
}

const FLOW_MIN = 60;
const LOCK_MIN = 3600;
const MAX_SPAN = 30 * 365 * 86400;

function readSpan(formData: FormData, min: number): number {
  const duration = Number(formData.get("duration"));
  if (!Number.isInteger(duration) || duration < min || duration > MAX_SPAN) {
    throw new Error(min >= 3600 ? "Pick a day at least an hour from now, and no more than 30 years away." : "Pick a later day. The contract needs at least a minute, and no more than 30 years.");
  }
  return duration;
}

export async function createSaving(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let id = "";
  try {
    id = await openSaving(await accountIndex(), {
      name: String(formData.get("name") ?? ""),
      amount: String(formData.get("amount") ?? ""),
      target: String(formData.get("target") ?? ""),
      duration: readSpan(formData, FLOW_MIN),
    });
  } catch (error) {
    return { error: explain(error) };
  }
  refresh();
  redirect(`/goals/${id}?fresh=1`);
}

export async function createStream(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const startAt = Number(formData.get("startAt") ?? "0");
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(startAt) || startAt < 0 || (startAt !== 0 && (startAt < now - 120 || startAt > now + MAX_SPAN))) {
    return { error: "Pick a start date from today onward." };
  }
  let id = "";
  try {
    id = await openStream(await accountIndex(), {
      name: String(formData.get("name") ?? ""),
      amount: String(formData.get("amount") ?? ""),
      duration: readSpan(formData, FLOW_MIN),
      kind: formData.get("kind") === "expense" ? "expense" : "flow",
      recipient: String(formData.get("recipient") ?? "") as Address,
      startAt,
    });
  } catch (error) {
    return { error: explain(error) };
  }
  refresh();
  redirect(`/goals/${id}?fresh=1`);
}

export async function createLock(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let id = "";
  try {
    id = await openLock(await accountIndex(), {
      name: String(formData.get("name") ?? ""),
      amount: String(formData.get("amount") ?? ""),
      target: String(formData.get("target") ?? ""),
      duration: readSpan(formData, LOCK_MIN),
      earnYield: formData.get("yield") === "on",
    });
  } catch (error) {
    return { error: explain(error) };
  }
  refresh();
  redirect(id ? `/vaults/${id}?fresh=1` : "/vaults");
}

export async function createGroup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const members = formData.getAll("member").map(String) as Address[];
    const plan = cyclePlan(String(formData.get("cycle") ?? ""), Number(formData.get("days")));
    if (!plan) return { error: "That cycle length is outside what the contract allows. Use 1 to 366 days." };
    await openGroup(await accountIndex(), {
      contribution: String(formData.get("contribution") ?? ""),
      members,
      cycles: Number(formData.get("cycles") ?? "4"),
      cycleSeconds: plan.cycle,
      windowSeconds: plan.window,
      graceSeconds: plan.grace,
    });
  } catch (error) {
    return { error: explain(error) };
  }
  refresh();
  redirect("/groups");
}

async function run(work: () => Promise<void>): Promise<ActionState> {
  try {
    await work();
  } catch (error) {
    return { error: explain(error) };
  }
  refresh();
  return null;
}

export async function doAddFunds(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => addToGoal(await accountIndex(), BigInt(String(formData.get("id"))), String(formData.get("amount") ?? "")));
}

export async function doRelease(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => releaseGoal(await accountIndex(), BigInt(String(formData.get("id"))), String(formData.get("amount") ?? "")));
}

export async function doVault(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const fn = String(formData.get("fn")) as "pause" | "resume" | "cancel" | "settle" | "withdraw";
  const id = BigInt(String(formData.get("id") ?? "0"));
  return run(async () => vaultCall(await accountIndex(), fn, id));
}

export async function doLockTop(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => lockTopUp(await accountIndex(), BigInt(String(formData.get("id"))), String(formData.get("amount") ?? "")));
}

export async function doBreak(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const state = await run(async () => lockBreak(await accountIndex(), BigInt(String(formData.get("id")))));
  if (state?.error) return state;
  redirect("/vaults");
}

export async function doMature(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const state = await run(async () => lockMature(await accountIndex(), BigInt(String(formData.get("id")))));
  if (state?.error) return state;
  redirect("/vaults");
}

export async function doGroup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const fn = String(formData.get("fn")) as
    | "postCollateral"
    | "start"
    | "contribute"
    | "exitBeforeStart"
    | "cancelBeforeStart"
    | "claimCollateral";
  return run(async () => groupAct(await accountIndex(), BigInt(String(formData.get("id"))), fn));
}
