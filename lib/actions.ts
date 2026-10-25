"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAddress, isAddress, type Address } from "viem";
import {
  addToGoal,
  explain,
  groupAct,
  shiftPayout,
  lockBreak,
  lockMature,
  lockTopUp,
  linkPhone,
  openLock,
  openSaving,
  openStream,
  releaseGoal,
  vaultCall,
} from "@/lib/protocol";
import { currencyForCountry } from "@/lib/place";
import {
  acceptApplicant,
  addDraftMember,
  applyToDraft,
  declineApplicant,
  deleteDraft,
  dropPhone,
  launchDraft,
  moveDraftMember,
  openDraft,
  phoneFor,
  removeDraftMember,
  saveEmail,
  saveIdentity,
  savePassword,
  savePhone,
  setDraftOpen,
} from "@/lib/circle";
import { acceptedTerms, accountIndex, clearSession, currencyChoice, rememberCurrency, rememberName, rememberTerms, rememberTester, rememberWallet } from "@/lib/session";

export type ActionState = { error: string } | null;

function refresh() {
  revalidatePath("/", "layout");
}

function spoken(error: unknown): ActionState {
  if (typeof error === "object" && error !== null && "digest" in error && String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")) {
    throw error;
  }
  const message = error instanceof Error ? error.message : "";
  if (message && message.length < 180 && !message.includes("\n")) return { error: message };
  return { error: explain(error) };
}

async function requireTerms() {
  if (!(await acceptedTerms())) throw new Error("Accept the terms before you sign.");
}

export async function noteTerms() {
  await rememberTerms();
}

export async function acceptTerms() {
  await rememberTerms();
  refresh();
}

export async function enterApp(formData: FormData) {
  if (String(formData.get("terms")) !== "yes") throw new Error("Accept the terms before you sign.");
  await rememberTerms();
  await rememberTester(0);
  redirect("/home");
}

export async function openSession(address: string, method: "passkey" | "wallet", label: string) {
  if ((method !== "passkey" && method !== "wallet") || !isAddress(address)) {
    throw new Error("That sign-in could not be saved.");
  }
  await requireTerms();
  await rememberWallet(getAddress(address), method, label.trim().slice(0, 32));
  redirect("/home");
}

export async function saveDisplayName(formData: FormData) {
  await rememberName(String(formData.get("name") ?? ""));
  refresh();
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

export async function rememberPlace(country: string) {
  if (!/^[A-Za-z]{2}$/.test(country)) return;
  if (await currencyChoice()) return;
  const code = currencyForCountry(country);
  if (!code) return;
  await rememberCurrency(code);
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
    await requireTerms();
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
    await requireTerms();
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
    await requireTerms();
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

export async function createDraft(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let id = "";
  try {
    id = await openDraft({
      contribution: String(formData.get("contribution") ?? ""),
      cycles: Number(formData.get("cycles") ?? "4"),
      cycle: String(formData.get("cycle") ?? ""),
      days: String(formData.get("days") ?? ""),
    });
  } catch (error) {
    return spoken(error);
  }
  refresh();
  redirect(`/groups/draft/${id}`);
}

export async function addMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await addDraftMember(String(formData.get("id") ?? ""), String(formData.get("who") ?? ""));
  } catch (error) {
    return spoken(error);
  }
  refresh();
  return null;
}

export async function moveMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const dir = formData.get("dir") === "up" ? -1 : 1;
    await moveDraftMember(String(formData.get("id") ?? ""), Number(formData.get("from")), dir);
  } catch (error) {
    return spoken(error);
  }
  refresh();
  return null;
}

export async function removeMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await removeDraftMember(String(formData.get("id") ?? ""), String(formData.get("address") ?? ""));
  } catch (error) {
    return spoken(error);
  }
  refresh();
  return null;
}

export async function applyJoin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await applyToDraft(String(formData.get("id") ?? ""));
  } catch (error) {
    return spoken(error);
  }
  refresh();
  return null;
}

export async function acceptJoin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await acceptApplicant(String(formData.get("id") ?? ""), String(formData.get("address") ?? ""));
  } catch (error) {
    return spoken(error);
  }
  refresh();
  return null;
}

export async function declineJoin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await declineApplicant(String(formData.get("id") ?? ""), String(formData.get("address") ?? ""));
  } catch (error) {
    return spoken(error);
  }
  refresh();
  return null;
}

export async function toggleApplications(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await setDraftOpen(String(formData.get("id") ?? ""), formData.get("open") === "yes");
  } catch (error) {
    return spoken(error);
  }
  refresh();
  return null;
}

export async function removeDraft(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await deleteDraft(String(formData.get("id") ?? ""));
  } catch (error) {
    return spoken(error);
  }
  refresh();
  redirect("/groups");
}

export async function startDraft(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let chainId = "";
  try {
    await requireTerms();
    chainId = await launchDraft(String(formData.get("id") ?? ""));
  } catch (error) {
    return spoken(error);
  }
  refresh();
  redirect(chainId ? `/groups/${chainId}` : "/groups");
}

export async function moveTurn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireTerms();
    const dir = formData.get("dir") === "up" ? -1 : 1;
    await shiftPayout(await accountIndex(), BigInt(String(formData.get("id"))), Number(formData.get("from")), dir);
  } catch (error) {
    return spoken(error);
  }
  refresh();
  return null;
}

export async function useMyPhone(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireTerms();
    const who = String(formData.get("address") ?? "") as Address;
    const phone = isAddress(who) ? await phoneFor(who) : "";
    await linkPhone(await accountIndex(), BigInt(String(formData.get("id"))), phone);
  } catch (error) {
    return spoken(error);
  }
  refresh();
  return null;
}

export async function addPhone(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await savePhone(String(formData.get("phone") ?? ""));
  } catch (error) {
    return spoken(error);
  }
  refresh();
  return null;
}

export async function removePhone(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await dropPhone(String(formData.get("phone") ?? ""));
  } catch (error) {
    return spoken(error);
  }
  refresh();
  return null;
}

export async function keepEmail(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await saveEmail(String(formData.get("email") ?? ""));
  } catch (error) {
    return spoken(error);
  }
  refresh();
  return null;
}

export async function keepIdentity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await saveIdentity({
      memberCode: String(formData.get("memberCode") ?? ""),
      idStatus: String(formData.get("idStatus") ?? ""),
      kinName: String(formData.get("kinName") ?? ""),
      kinContact: String(formData.get("kinContact") ?? ""),
    });
  } catch (error) {
    return spoken(error);
  }
  refresh();
  return null;
}

export async function keepPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await savePassword(String(formData.get("password") ?? ""));
  } catch (error) {
    return spoken(error);
  }
  refresh();
  return null;
}

async function run(work: () => Promise<void>): Promise<ActionState> {
  try {
    await requireTerms();
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
