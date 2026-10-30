"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAddress, isAddress, type Address } from "viem";
import { assetKind } from "@/lib/assets";
import type { DepositPreview } from "@/lib/deposit-math";
import { asTokenAmount, shortAddress } from "@/lib/display";
import { idleSuper, previewLines, previewWithdraw, walletSuper } from "@/lib/funding";
import { walletStamp } from "@/lib/holdings";
import type { Intent, SignPayload } from "@/lib/intent";
import { inferFrequency } from "@/lib/intent";
import { goalNotes, patchGoalNote, recordActivity, saveGoalNote, type ActivityRecord } from "@/lib/notes";
import { parseUsd, readPay, readReceive, type PayAsset } from "@/lib/pay-math";
import { activityUnits, isSendAsset, parseSendAmount, type SendAsset } from "@/lib/send-math";
import { sendRoute } from "@/lib/send";
import { appGroupNet, groupNetLabel, netFromLabel, parseGroupKey, type GroupNet } from "@/lib/group-network";
import { vaultSite } from "@/lib/vault-site";
import { planIntent } from "@/lib/plan";
import {
  addToGoal,
  broadcastCalls,
  explain,
  groupAct,
  shiftPayout,
  linkPhone,
  loadPortfolio,
  lockBreak,
  lockMature,
  chain,
  lockTopUp,
  networkName,
  openLock,
  openSaving,
  openStream,
  parseAmount,
  releaseGoal,
  vaultCall,
} from "@/lib/protocol";
import { currencyForCountry } from "@/lib/place";
import { loadQuote } from "@/lib/rates";
import {
  acceptApplicant,
  addDraftMember,
  applyToDraft,
  declineApplicant,
  deleteDraft,
  dropPhone,
  groupCreateIntent,
  findAccount,
  findGroupCode,
  hintForEmail,
  launchDraft,
  renameGroup,
  updateDraft,
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
import { filledName } from "@/lib/next-label";
import { acceptedTerms, accountIndex, clearSession, currencyChoice, rememberCurrency, rememberName, rememberTerms, rememberTester, rememberWallet, viewer, type Viewer } from "@/lib/session";

export type ActionState = { error?: string; sign?: SignPayload; saved?: boolean } | null;

function refIntent<T extends Intent>(intent: T): T {
  return { ...intent, ref: intent.ref || randomUUID() };
}

async function quotedAmount(raw: string, eth = false): Promise<string> {
  const clean = raw.replace(/,/g, "").trim();
  if (eth) return clean;
  return asTokenAmount(clean, await loadQuote());
}

function signPayload(who: Viewer, intent: Intent, calls: SignPayload["calls"], chainId?: number): ActionState {
  if (who.method === "tester") return { error: "This account signs on the server." };
  const sendChain = intent.kind === "send" && isSendAsset(intent.asset) ? sendRoute(intent.asset).chainId : undefined;
  return {
    sign: {
      nonce: randomUUID(),
      calls,
      intent,
      method: who.method,
      address: who.address,
      chainId: chainId ?? sendChain,
    },
  };
}

async function rememberIntent(owner: string, intent: Intent, id?: string) {
  try {
    if ((intent.kind === "saving" || intent.kind === "stream") && id) {
      await saveGoalNote(owner, id, { description: intent.description, frequency: intent.frequency, paused: false });
    }
    if (intent.kind === "groupCreate") {
      try {
        await deleteDraft(intent.draftId);
      } catch {
        // The draft is already gone, or this account cannot remove it.
      }
    }
    const row = activityFrom(owner, intent, id);
    if (row) await recordActivity(row);
  } catch {
    // A missed activity line must not undo a payment that already succeeded.
  }
}

function wei(value: string): string | null {
  try {
    const amount = parseAmount(value);
    return amount > 0n ? amount.toString() : null;
  } catch {
    return null;
  }
}

function pricedWei(value: string): string | null {
  try {
    return (parseUsd(value) * 10n ** 12n).toString();
  } catch {
    return null;
  }
}

function activityAmount(value: string, priced: boolean): string | null {
  return priced ? pricedWei(value) : wei(value);
}

function rethrowRedirect(error: unknown) {
  if (typeof error === "object" && error !== null && "digest" in error && String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")) {
    throw error;
  }
}

function networkField(formData: FormData): GroupNet {
  return netFromLabel(String(formData.get("network") ?? ""));
}

function wrongChain(id: string, formData: FormData): string | null {
  if (!formData.get("pay")) return null;
  const here = parseGroupKey(id).net;
  const token = networkField(formData);
  if (here === token) return null;
  return `This is on ${groupNetLabel(here)}. Swap to a ${groupNetLabel(here)} token first.`;
}

function payField(formData: FormData): PayAsset | undefined {
  const raw = String(formData.get("pay") ?? "");
  return raw ? readPay(raw) : undefined;
}

function usdField(formData: FormData): string {
  const amount = String(formData.get("amount") ?? "");
  parseUsd(amount);
  return amount;
}

async function finishTester(intent: Intent): Promise<ActionState> {
  const who = await viewer();
  const index = await accountIndex();
  let current = refIntent(intent);
  for (let step = 0; step < 6; step += 1) {
    const planned = await planIntent(who.address, current);
    if (planned.pending) return { error: "That transaction is still confirming. Refresh in a moment." };
    if (planned.chainId && planned.chainId !== chain.id) {
      return { error: `This test account signs on ${networkName}. Connect a wallet to send on the other chain.` };
    }
    if (planned.done || planned.calls.length === 0) {
      await rememberIntent(who.address, planned.intent, planned.id);
      refresh();
      redirect(planned.href ?? "/home");
    }
    await broadcastCalls(index, planned.calls);
    current = planned.intent;
  }
  return { error: "That payment took more steps than expected. Refresh and try again." };
}

function activityFrom(owner: string, intent: Intent, id?: string): ActivityRecord | null {
  const at = Math.floor(Date.now() / 1000);
  const base = { id: `app:${intent.ref}`, owner, at, asset: "usdcx" as const };
  if (intent.kind === "saving") {
    const amount = activityAmount(intent.amount, Boolean(intent.pay));
    return amount ? { ...base, title: "Saved to goal", detail: intent.name, direction: "in", amount, href: `/goals/${id ?? ""}` } : null;
  }
  if (intent.kind === "stream") {
    const amount = activityAmount(intent.amount, Boolean(intent.pay));
    return amount
      ? { ...base, title: intent.flowKind === "expense" ? "Expense" : "Streamed", detail: intent.name, direction: "out", amount, href: `/goals/${id ?? ""}` }
      : null;
  }
  if (intent.kind === "lock") {
    const amount = activityAmount(intent.amount, Boolean(intent.pay));
    return amount
      ? { ...base, title: "Locked", detail: intent.name, direction: "out", amount, asset: assetKind(intent.token) === "ethx" ? "ethx" : "usdcx", href: `/vaults/${id ?? ""}` }
      : null;
  }
  if (intent.kind === "deposit") {
    const amount = activityAmount(intent.amount, Boolean(intent.pay));
    return amount ? { ...base, title: "Added money", detail: "Wallet", direction: "in", amount, href: "/home" } : null;
  }
  if (intent.kind === "withdraw") {
    const amount = intent.receive ? pricedWei(intent.amount) : intent.amount;
    return amount ? { ...base, title: "Moved to wallet", detail: intent.receive ? intent.receive.toUpperCase() : "Vault", direction: "out", amount, href: "/home" } : null;
  }
  if (intent.kind === "send" && isSendAsset(intent.asset)) {
    const units = activityUnits(intent.asset, parseSendAmount(intent.asset, intent.amount));
    return { ...base, title: "Sent", detail: intent.label, direction: "out", amount: units.amount, asset: units.asset, href: "/home" };
  }
  if (intent.kind === "goal" && intent.fn === "topup") {
    const amount = activityAmount(intent.amount, Boolean(intent.pay));
    return amount ? { ...base, title: "Saved to goal", detail: "Top up", direction: "in", amount, href: `/goals/${intent.id}` } : null;
  }
  if (intent.kind === "goal" && intent.fn === "release") {
    const amount = wei(intent.amount);
    return amount ? { ...base, title: "Moved to idle", detail: "Goal", direction: "out", amount, href: `/goals/${intent.id}` } : null;
  }
  if (intent.kind === "lockAct" && intent.fn === "topup") {
    const amount = activityAmount(intent.amount, Boolean(intent.pay));
    return amount ? { ...base, title: "Locked", detail: "Top up", direction: "out", amount, href: `/vaults/${intent.id}` } : null;
  }
  if (intent.kind === "claim") {
    return { ...base, title: "Claimed G$", detail: "Daily UBI", direction: "in", amount: "0", href: "/settings" };
  }
  if (intent.kind === "link") {
    return { ...base, title: "Linked a wallet", detail: shortAddress(intent.target), direction: "in", amount: "0", href: "/settings" };
  }
  if (intent.kind === "gdxSwap") {
    return {
      ...base,
      title: intent.side === "buy" ? "Bought G$" : "Sold G$",
      detail: "GoodDollar Reserve",
      direction: intent.side === "buy" ? "in" : "out",
      amount: "0",
      href: "/home/assets",
    };
  }
  return null;
}

async function handoff(intent: Intent): Promise<ActionState> {
  const who = await viewer();
  if (who.method === "tester") throw new Error("This account signs on the server.");
  const ready = refIntent(intent);
  const step = await planIntent(who.address, ready);
  if (step.pending) return { error: "That transaction is still confirming. Refresh in a moment." };
  if (step.done || step.calls.length === 0) {
    await rememberIntent(who.address, step.intent, step.id);
    if (step.href) redirect(step.href);
    return null;
  }
  return signPayload(who, step.intent, step.calls, step.chainId);
}

export async function continueIntent(intent: Intent): Promise<{ error?: string; href?: string; sign?: SignPayload }> {
  try {
    await requireTerms();
    const who = await viewer();
    if (who.method === "tester") return { error: "This session signs on the server. Reload and try again." };
    const step = await planIntent(who.address, intent);
    if (step.pending) return { error: "The transaction was sent, but the account has not caught up yet. Refresh in a moment." };
    if (step.done || step.calls.length === 0) {
      await rememberIntent(who.address, step.intent, step.id);
      refresh();
      return { href: step.href };
    }
    const signed = signPayload(who, step.intent, step.calls, step.chainId);
    return signed?.sign ? { sign: signed.sign } : { error: "The wallet could not be asked to sign." };
  } catch (error) {
    return { error: explain(error) };
  }
}

function refresh() {
  revalidatePath("/", "layout");
}

function spoken(error: unknown): ActionState {
  if (typeof error === "object" && error !== null && "digest" in error && String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")) {
    throw error;
  }
  const message = error instanceof Error ? error.message : "";
  if (/Failed query:|Connection terminated|MotherDuck is not configured/i.test(message)) {
    return { error: "The member directory is unavailable, so this cannot be saved right now." };
  }
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

export async function lookUpEmail(email: string, known: string[]) {
  return hintForEmail(email, Array.isArray(known) ? known : []);
}

export type LookupState = { error?: string; name?: string; address?: string; query?: string } | null;

export async function lookupAccount(_prev: LookupState, formData: FormData): Promise<LookupState> {
  const query = String(formData.get("who") ?? "").trim();
  try {
    await requireTerms();
    const found = await findAccount(query);
    return { name: found.name, address: found.address, query };
  } catch (error) {
    return { error: error instanceof Error && error.message.length < 180 && !error.message.includes("\n") ? error.message : explain(error), query };
  }
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

function readStart(formData: FormData): number | { error: string } {
  const startAt = Number(formData.get("startAt") ?? "0");
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(startAt) || startAt < 0 || (startAt !== 0 && (startAt < now - 120 || startAt > now + MAX_SPAN))) {
    return { error: "Pick a start date from today onward." };
  }
  return startAt;
}

export async function createSaving(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const start = readStart(formData);
  if (typeof start !== "number") return start;
  try {
    await requireTerms();
    const who = await viewer();
    const duration = readSpan(formData, FLOW_MIN);
    const sendTo = String(formData.get("recipient") ?? "");
    if (sendTo && sendTo.toLowerCase() !== who.address.toLowerCase()) {
      return { error: "A saving stays in your vault. Use Expense to pay another wallet." };
    }
    const book = await loadPortfolio(who);
    const name = filledName(String(formData.get("name") ?? ""), "saving", book.flows.filter((row) => row.kind === "saving").map((row) => row.name));
    const pay = payField(formData);
    const amount = pay ? usdField(formData) : await quotedAmount(String(formData.get("amount") ?? ""));
    const description = String(formData.get("description") ?? "").trim().slice(0, 280);
    const intent = refIntent({
      kind: "saving" as const,
      name,
      amount,
      duration,
      description,
      frequency: inferFrequency(duration),
      startedAt: Math.floor(Date.now() / 1000),
      startAt: start,
      pay,
      network: networkField(formData),
      ref: "",
    });
    if (who.method === "tester") {
      if (pay || intent.network !== appGroupNet()) return await finishTester(intent);
      const id = await openSaving(await accountIndex(), { name, amount, target: "", duration, startAt: start });
      await rememberIntent(who.address, intent, id);
      refresh();
      redirect(`/goals/${id}?fresh=1`);
    }
    return await handoff(intent);
  } catch (error) {
    rethrowRedirect(error);
    return { error: explain(error) };
  }
}

export async function createStream(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const start = readStart(formData);
  if (typeof start !== "number") return start;
  const startAt = start;
  const now = Math.floor(Date.now() / 1000);
  try {
    await requireTerms();
    const who = await viewer();
    const duration = readSpan(formData, FLOW_MIN);
    const flowKind = formData.get("kind") === "expense" ? "expense" : "flow";
    const book = await loadPortfolio(who);
    const name = filledName(
      String(formData.get("name") ?? ""),
      flowKind,
      book.flows.filter((row) => row.kind === flowKind).map((row) => row.name),
    );
    const pay = payField(formData);
    const amount = pay ? usdField(formData) : await quotedAmount(String(formData.get("amount") ?? ""));
    const description = String(formData.get("description") ?? "").trim().slice(0, 280);
    const intent = refIntent({
      kind: "stream" as const,
      name,
      amount,
      duration,
      flowKind,
      recipient: String(formData.get("recipient") ?? who.address),
      startAt,
      description,
      frequency: inferFrequency(duration),
      startedAt: now,
      pay,
      network: networkField(formData),
      ref: "",
    });
    if (who.method === "tester") {
      if (pay || intent.network !== appGroupNet()) return await finishTester(intent);
      const id = await openStream(await accountIndex(), {
        name,
        amount,
        duration,
        kind: flowKind,
        recipient: intent.recipient as Address,
        startAt,
      });
      await rememberIntent(who.address, intent, id);
      refresh();
      redirect(`/goals/${id}?fresh=1`);
    }
    return await handoff(intent);
  } catch (error) {
    rethrowRedirect(error);
    return { error: explain(error) };
  }
}

export async function createLock(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireTerms();
    const who = await viewer();
    const duration = readSpan(formData, LOCK_MIN);
    const pay = payField(formData);
    const network = networkField(formData);
    const token = pay ? vaultSite(network).fusdcx : String(formData.get("token") ?? "");
    const amount = pay ? usdField(formData) : await quotedAmount(String(formData.get("amount") ?? ""));
    const name = pay ? "USD" : String(formData.get("name") ?? "USD");
    const intent = refIntent({
      kind: "lock" as const,
      token,
      name,
      amount,
      duration,
      earnYield: formData.get("yield") === "on",
      startedAt: Math.floor(Date.now() / 1000),
      pay,
      network,
      ref: "",
    });
    if (who.method === "tester") {
      if (pay || network !== appGroupNet()) return await finishTester(intent);
      const id = await openLock(await accountIndex(), {
        name,
        amount,
        target: "",
        duration,
        earnYield: intent.earnYield,
        token: isAddress(token) ? getAddress(token) : undefined,
      });
      await rememberIntent(who.address, intent, id);
      refresh();
      redirect(id ? `/vaults/${id}?fresh=1` : "/vaults");
    }
    return await handoff(intent);
  } catch (error) {
    rethrowRedirect(error);
    return { error: explain(error) };
  }
}

export async function addMoney(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireTerms();
    const who = await viewer();
    const pay = payField(formData);
    const network = networkField(formData);
    const amount = pay ? usdField(formData) : await quotedAmount(String(formData.get("amount") ?? ""));
    const intent = refIntent({
      kind: "deposit" as const,
      token: vaultSite(network).fusdcx,
      amount,
      pay,
      network,
      ref: "",
    });
    if (who.method === "tester") {
      if (pay || network !== appGroupNet()) return await finishTester(intent);
      const { depositIdle } = await import("@/lib/protocol");
      await depositIdle(await accountIndex(), amount);
      await rememberIntent(who.address, intent);
      refresh();
      redirect("/home");
    }
    return await handoff(intent);
  } catch (error) {
    rethrowRedirect(error);
    return { error: explain(error) };
  }
}

export async function createDraft(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let id = "";
  try {
    id = await openDraft({
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      contribution: String(formData.get("contribution") ?? ""),
      cycles: Number(formData.get("cycles") ?? "4"),
      cycle: String(formData.get("cycle") ?? ""),
      days: String(formData.get("days") ?? ""),
      plain: String(formData.get("payout") ?? "") === "plain",
      network: String(formData.get("network") ?? ""),
    });
  } catch (error) {
    return spoken(error);
  }
  refresh();
  redirect(`/groups/draft/${id}`);
}

export async function saveDraft(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  try {
    await updateDraft(id, {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      contribution: String(formData.get("contribution") ?? ""),
      cycles: Number(formData.get("cycles") ?? "4"),
      cycle: String(formData.get("cycle") ?? ""),
      days: String(formData.get("days") ?? ""),
      plain: String(formData.get("payout") ?? "") === "plain",
      network: String(formData.get("network") ?? ""),
    });
  } catch (error) {
    return spoken(error);
  }
  refresh();
  redirect(`/groups/draft/${id}`);
}

export async function saveGroupName(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  try {
    await renameGroup(id, String(formData.get("name") ?? ""), String(formData.get("description") ?? ""));
  } catch (error) {
    return spoken(error);
  }
  refresh();
  redirect(`/groups/${id}`);
}

export async function joinGroup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const found = await findGroupCode(String(formData.get("code") ?? ""));
    if (!found) return { error: "No group uses that code." };
    redirect(found.href);
  } catch (error) {
    rethrowRedirect(error);
    return spoken(error);
  }
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
  try {
    await requireTerms();
    const who = await viewer();
    const draftId = String(formData.get("id") ?? "");
    if (who.method === "tester") {
      const chainId = await launchDraft(draftId);
      refresh();
      redirect(chainId ? `/groups/${chainId}` : "/groups");
    }
    return await handoff(refIntent(await groupCreateIntent(draftId)));
  } catch (error) {
    return spoken(error);
  }
}

export async function moveTurn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireTerms();
    const who = await viewer();
    const id = String(formData.get("id"));
    const from = Number(formData.get("from"));
    const dir = formData.get("dir") === "up" ? -1 : 1;
    if (who.method === "tester") {
      const group = parseGroupKey(id);
      if (group.net !== appGroupNet()) {
        return { error: `This test account signs on ${groupNetLabel(appGroupNet())}. Connect a wallet to act on ${groupNetLabel(group.net)}.` };
      }
      await shiftPayout(await accountIndex(), group.id, from, dir);
      refresh();
      return null;
    }
    return await handoff(refIntent({ kind: "payout", id, from, dir, ref: "" }));
  } catch (error) {
    return spoken(error);
  }
}

export async function useMyPhone(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireTerms();
    const who = await viewer();
    const id = String(formData.get("id"));
    const address = String(formData.get("address") ?? "");
    const phone = isAddress(address) ? await phoneFor(address as Address) : "";
    if (who.method === "tester") {
      const group = parseGroupKey(id);
      if (group.net !== appGroupNet()) {
        return { error: `This test account signs on ${groupNetLabel(appGroupNet())}. Connect a wallet to act on ${groupNetLabel(group.net)}.` };
      }
      await linkPhone(await accountIndex(), group.id, phone);
      refresh();
      return null;
    }
    return await handoff(refIntent({ kind: "phone", id, phone, ref: "" }));
  } catch (error) {
    return spoken(error);
  }
}

export async function addPhone(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await savePhone(String(formData.get("phone") ?? ""));
  } catch (error) {
    return spoken(error);
  }
  refresh();
  return { saved: true };
}

export async function removePhone(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await dropPhone(String(formData.get("phone") ?? ""));
  } catch (error) {
    return spoken(error);
  }
  refresh();
  return { saved: true };
}

export async function keepEmail(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await saveEmail(String(formData.get("email") ?? ""));
  } catch (error) {
    return spoken(error);
  }
  refresh();
  return { saved: true };
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
  return { saved: true };
}

export async function keepPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await savePassword(String(formData.get("password") ?? ""));
  } catch (error) {
    return spoken(error);
  }
  refresh();
  return { saved: true };
}

export async function doAddFunds(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireTerms();
    const who = await viewer();
    const id = String(formData.get("id") ?? "");
    const pay = payField(formData);
    const crossed = wrongChain(id, formData);
    if (crossed) return { error: crossed };
    const amount = pay ? usdField(formData) : await quotedAmount(String(formData.get("amount") ?? ""));
    const [data, notes] = await Promise.all([loadPortfolio(who), goalNotes(who.address)]);
    const flow = data.flows.find((item) => item.id === id);
    if (flow?.kind === "saving" && notes[id]?.paused) {
      return { error: "This saving goal is paused. Resume it to add money." };
    }
    const intent = refIntent({ kind: "goal" as const, fn: "topup" as const, id, amount, pay, ref: "" });
    if (who.method === "tester") {
      if (pay || parseGroupKey(id).net !== appGroupNet()) return await finishTester(intent);
      await addToGoal(await accountIndex(), parseGroupKey(id).id, amount);
      await rememberIntent(who.address, intent);
      refresh();
      return null;
    }
    return await handoff(intent);
  } catch (error) {
    rethrowRedirect(error);
    return { error: explain(error) };
  }
}

export async function doRelease(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireTerms();
    const who = await viewer();
    const id = String(formData.get("id") ?? "");
    const amount = await quotedAmount(String(formData.get("amount") ?? ""));
    const intent = refIntent({ kind: "goal" as const, fn: "release" as const, id, amount, ref: "" });
    if (who.method === "tester") {
      if (parseGroupKey(id).net !== appGroupNet()) return await finishTester(intent);
      await releaseGoal(await accountIndex(), parseGroupKey(id).id, amount);
      await rememberIntent(who.address, intent);
      refresh();
      return null;
    }
    return await handoff(intent);
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function doVault(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const fn = String(formData.get("fn")) as "pause" | "resume" | "cancel" | "settle" | "withdraw";
  const raw = String(formData.get("id") ?? "0");
  try {
    await requireTerms();
    const who = await viewer();
    if (fn === "pause" || fn === "resume") {
      const data = await loadPortfolio(who);
      const flow = data.flows.find((item) => item.id === raw);
      if (flow?.kind === "saving") {
        await patchGoalNote(who.address, raw, { paused: fn === "pause" });
        refresh();
        return null;
      }
    }
    const intent = refIntent(
      fn === "withdraw"
        ? { kind: "withdraw" as const, amount: raw, ref: "" }
        : { kind: "goal" as const, fn, id: raw, amount: "", ref: "" },
    );
    if (who.method === "tester") {
      if (fn !== "withdraw" && parseGroupKey(raw).net !== appGroupNet()) return await finishTester(intent);
      await vaultCall(await accountIndex(), fn, fn === "withdraw" ? BigInt(raw) : parseGroupKey(raw).id);
      if (fn === "withdraw") await rememberIntent(who.address, intent);
      refresh();
      return null;
    }
    return await handoff(intent);
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function doLockTop(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireTerms();
    const who = await viewer();
    const id = String(formData.get("id") ?? "");
    const pay = payField(formData);
    const crossed = wrongChain(id, formData);
    if (crossed) return { error: crossed };
    const data = await loadPortfolio(who);
    const lock = data.locks.find((item) => item.id === id);
    const amount = pay ? usdField(formData) : await quotedAmount(String(formData.get("amount") ?? ""), lock ? assetKind(lock.token) === "ethx" : false);
    const intent = refIntent({ kind: "lockAct" as const, fn: "topup" as const, id, amount, pay, ref: "" });
    if (who.method === "tester") {
      if (pay || parseGroupKey(id).net !== appGroupNet()) return await finishTester(intent);
      await lockTopUp(await accountIndex(), parseGroupKey(id).id, amount);
      await rememberIntent(who.address, intent);
      refresh();
      return null;
    }
    return await handoff(intent);
  } catch (error) {
    rethrowRedirect(error);
    return { error: explain(error) };
  }
}

export async function doBreak(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireTerms();
    const who = await viewer();
    const id = String(formData.get("id") ?? "");
    const intent = refIntent({ kind: "lockAct" as const, fn: "break" as const, id, amount: "", ref: "" });
    if (who.method === "tester") {
      if (parseGroupKey(id).net !== appGroupNet()) return await finishTester(intent);
      await lockBreak(await accountIndex(), parseGroupKey(id).id);
      refresh();
      redirect("/vaults");
    }
    return await handoff(intent);
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function doMature(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireTerms();
    const who = await viewer();
    const id = String(formData.get("id") ?? "");
    const intent = refIntent({ kind: "lockAct" as const, fn: "mature" as const, id, amount: "", ref: "" });
    if (who.method === "tester") {
      if (parseGroupKey(id).net !== appGroupNet()) return await finishTester(intent);
      await lockMature(await accountIndex(), parseGroupKey(id).id);
      refresh();
      redirect("/vaults");
    }
    return await handoff(intent);
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function doGroup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const fn = String(formData.get("fn")) as
    | "postCollateral"
    | "start"
    | "contribute"
    | "exitBeforeStart"
    | "cancelBeforeStart"
    | "claimCollateral";
  try {
    await requireTerms();
    const who = await viewer();
    const id = String(formData.get("id") ?? "");
    const pay = payField(formData);
    const crossed = wrongChain(id, formData);
    if (crossed) return { error: crossed };
    const intent = refIntent({ kind: "group" as const, fn, id, pay, ref: "" });
    if (who.method === "tester") {
      if (pay) return await finishTester(intent);
      const group = parseGroupKey(id);
      if (group.net !== appGroupNet()) {
        return { error: `This test account signs on ${groupNetLabel(appGroupNet())}. Connect a wallet to act on ${groupNetLabel(group.net)}.` };
      }
      await groupAct(await accountIndex(), group.id, fn);
      refresh();
      return null;
    }
    return await handoff(intent);
  } catch (error) {
    rethrowRedirect(error);
    return { error: explain(error) };
  }
}

export async function saveGoalDetails(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const who = await viewer();
    const id = String(formData.get("id") ?? "");
    const description = String(formData.get("description") ?? "").trim().slice(0, 280);
    const frequency = String(formData.get("frequency") ?? "Monthly");
    if (!["Once", "Daily", "Weekly", "Monthly", "Yearly"].includes(frequency)) {
      return { error: "Pick a frequency." };
    }
    await patchGoalNote(who.address, id, { description, frequency: frequency as "Once" | "Daily" | "Weekly" | "Monthly" | "Yearly" });
  } catch (error) {
    return { error: explain(error) };
  }
  refresh();
  return null;
}

function sendAssetField(value: string): SendAsset {
  if (!isSendAsset(value)) throw new Error("Pick a token.");
  return value;
}

export async function sendFunds(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireTerms();
    const who = await viewer();
    const asset = sendAssetField(String(formData.get("asset") ?? ""));
    const amount = String(formData.get("amount") ?? "");
    parseSendAmount(asset, amount);
    const contact = String(formData.get("who") ?? "").trim();
    let to: Address;
    let label: string;
    if (contact) {
      const found = await findAccount(contact);
      to = found.address;
      label = found.name.slice(0, 64);
    } else {
      const raw = String(formData.get("to") ?? "").trim();
      if (!isAddress(raw)) return { error: "Enter a wallet address." };
      to = getAddress(raw);
      if (to.toLowerCase() === who.address.toLowerCase()) return { error: "That address is this account." };
      label = shortAddress(to);
    }
    const intent = refIntent({ kind: "send" as const, asset, amount: amount.replace(/,/g, "").trim(), to, label, ref: "" });
    if (who.method === "tester") return await finishTester(intent);
    return await handoff(intent);
  } catch (error) {
    rethrowRedirect(error);
    return spoken(error);
  }
}

export async function withdrawUsd(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireTerms();
    const who = await viewer();
    const amount = usdField(formData);
    const receive = readReceive(String(formData.get("receive") ?? "usdc"));
    const intent = refIntent({ kind: "withdraw" as const, amount, receive, ref: "" });
    if (who.method === "tester") return await finishTester(intent);
    return await handoff(intent);
  } catch (error) {
    rethrowRedirect(error);
    return { error: explain(error) };
  }
}

export async function topCeloIfNeeded() {
  const who = await viewer();
  const { topCeloFaucet } = await import("@/lib/good-faucet");
  return topCeloFaucet(who.address);
}

export async function topVerifiedCelo(address: string) {
  await viewer();
  if (!isAddress(address)) return "error" as const;
  const { topCeloFaucet } = await import("@/lib/good-faucet");
  return topCeloFaucet(getAddress(address));
}

export async function linkWallet(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireTerms();
    const who = await viewer();
    const target = String(formData.get("target") ?? "").trim();
    if (!isAddress(target)) return { error: "Enter the wallet to attach." };
    const intent = refIntent({ kind: "link" as const, target: getAddress(target), ref: "" });
    if (who.method === "tester") return await finishTester(intent);
    return await handoff(intent);
  } catch (error) {
    rethrowRedirect(error);
    return spoken(error);
  }
}

export async function swapGdx(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireTerms();
    const who = await viewer();
    const { isGdxSide } = await import("@/lib/gdx-reserve");
    const side = String(formData.get("side") ?? "");
    if (!isGdxSide(side)) return { error: "Pick buy or sell." };
    const amount = String(formData.get("amount") ?? "");
    parseSendAmount(side === "buy" ? "celo-usdm" : "celo-gdx", amount);
    const intent = refIntent({ kind: "gdxSwap" as const, side, amount: amount.replace(/,/g, "").trim(), ref: "" });
    if (who.method === "tester") return await finishTester(intent);
    return await handoff(intent);
  } catch (error) {
    rethrowRedirect(error);
    return spoken(error);
  }
}

export async function previewGdxSwap(input: { side: string; amount: string }): Promise<{ out?: string; error?: string }> {
  try {
    await viewer();
    const { formatAmount } = await import("@/lib/pay-math");
    const { isGdxSide, quoteGdxSwap } = await import("@/lib/gdx-reserve");
    if (!isGdxSide(input.side)) return { error: "Pick buy or sell." };
    const amount = parseSendAmount(input.side === "buy" ? "celo-usdm" : "celo-gdx", input.amount);
    const quoted = await quoteGdxSwap(input.side, amount);
    const digits = input.side === "buy" ? 4 : 6;
    return { out: formatAmount(quoted.amountOut, 18, digits) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The quote failed." };
  }
}

export async function claimUbi(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  try {
    await requireTerms();
    const who = await viewer();
    const intent = refIntent({ kind: "claim" as const, ref: "" });
    if (who.method === "tester") return await finishTester(intent);
    return await handoff(intent);
  } catch (error) {
    rethrowRedirect(error);
    return spoken(error);
  }
}

export async function previewDeposit(input: { pay: string; usd: string }): Promise<{ preview?: DepositPreview; error?: string }> {
  try {
    const who = await viewer();
    const { depositPreview } = await import("@/lib/funding");
    return { preview: await depositPreview(who.address, readPay(input.pay), input.usd) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The quote failed." };
  }
}

export async function previewPay(input: {
  pay: string;
  usd?: string;
  superWei?: string;
  mode: "vault" | "wallet" | "stream";
  duration?: number;
  protocolOnTop?: boolean;
  full?: boolean;
  network?: string;
}): Promise<{ lines: { label: string; value: string }[]; error?: string }> {
  try {
    const who = await viewer();
    const pay = readPay(input.pay);
    const covered = input.full ? 0n : input.mode === "wallet" ? await walletSuper(who.address) : await idleSuper(who.address);
    const lines = await previewLines({
      pay,
      usd: input.usd,
      superWei: input.superWei,
      mode: input.mode,
      duration: input.duration,
      protocolOnTop: input.protocolOnTop,
      coveredWei: covered.toString(),
      full: input.full,
      network: input.network,
    });
    return { lines };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The quote failed.";
    if (message.includes("Cannot decode zero data") || message.includes("viem@")) return { lines: [] };
    return { lines: [], error: message };
  }
}

export async function watchWallet(): Promise<{ stamp?: string; error?: string }> {
  try {
    const who = await viewer();
    return { stamp: await walletStamp(who.address) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The wallet could not be read." };
  }
}

export async function noteWalletChange() {
  revalidatePath("/", "layout");
}

export async function previewReceive(input: { usd: string; receive: string }): Promise<{ lines: { label: string; value: string }[]; error?: string }> {
  try {
    return { lines: await previewWithdraw(input.usd, readReceive(input.receive)) };
  } catch (error) {
    return { lines: [], error: error instanceof Error ? error.message : "The quote failed." };
  }
}
