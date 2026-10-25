import "server-only";

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getAddress, isAddress, type Address } from "viem";
import { cyclePlan, spanLabel } from "@/lib/cycle";
import { rows, sql, transaction } from "@/lib/motherduck";
import { ensureSchema } from "@/lib/records";
import type { IdStatus } from "@/lib/savings";
import { personName, people, openGroup, publishPhones } from "@/lib/protocol";
import { accountIndex, viewer, type Viewer } from "@/lib/session";

export type Contact = {
  phones: string[];
  email: string;
  passwordSet: boolean;
  memberCode: string;
  idStatus: IdStatus;
  kinName: string;
  kinContact: string;
};

export type DraftCard = {
  id: string;
  contribution: string;
  cycles: number;
  cycleLabel: string;
  count: number;
  role: "organizer" | "member" | "open" | "applied";
};

export type DraftMember = {
  address: Address;
  name: string;
  phone: string;
  you: boolean;
  organizer: boolean;
};

export type DraftView = {
  id: string;
  contribution: string;
  cycles: number;
  summary: string;
  open: boolean;
  mine: boolean;
  member: boolean;
  applied: boolean;
  members: DraftMember[];
  applications: { address: Address; name: string }[];
};

type Profile = {
  address: Address;
  name: string;
  phones: string[];
  email: string;
  password: string;
  memberCode: string;
  idStatus: IdStatus;
  kinName: string;
  kinContact: string;
};

type Draft = {
  id: string;
  creator: Address;
  contribution: string;
  cycles: number;
  cycle: string;
  days: string;
  members: Address[];
  open: boolean;
  applications: { address: Address; name: string }[];
};

type Store = { profiles: Profile[]; drafts: Draft[] };
type Bucket = "demo" | "app";
type World = Record<Bucket, Store>;

const MAX_MEMBERS = 50;
const buckets: Bucket[] = ["demo", "app"];

function empty(): Store {
  return { profiles: [], drafts: [] };
}

function bucketFor(address: string): Bucket {
  return people().some((person) => same(person.address, address)) ? "demo" : "app";
}

function table(bucket: Bucket, name: "profiles" | "phones" | "drafts" | "draft_members" | "applications") {
  return sql.raw(`${bucket}.${name}`);
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function readBucket(bucket: Bucket): Promise<Store> {
  const profiles = await rows<{
    address: string;
    name: string;
    email: string;
    password: string;
    member_code: string;
    id_status: string;
    kin_name: string;
    kin_contact: string;
  }>(
    sql`SELECT address, name, email, password, member_code, id_status, kin_name, kin_contact FROM ${table(bucket, "profiles")}`,
  );
  const phones = await rows<{ address: string; phone: string; position: unknown }>(
    sql`SELECT address, phone, position FROM ${table(bucket, "phones")} ORDER BY position`,
  );
  const drafts = await rows<{ id: string; creator: string; contribution: string; cycles: unknown; cycle: string; days: string; is_open: boolean }>(
    sql`SELECT id, creator, contribution, cycles, cycle, days, is_open FROM ${table(bucket, "drafts")}`,
  );
  const members = await rows<{ draft_id: string; position: unknown; address: string }>(
    sql`SELECT draft_id, position, address FROM ${table(bucket, "draft_members")} ORDER BY position`,
  );
  const applications = await rows<{ draft_id: string; address: string; name: string }>(
    sql`SELECT draft_id, address, name FROM ${table(bucket, "applications")}`,
  );
  return {
    profiles: profiles.flatMap((profile) => {
      const address = asAddress(profile.address);
      if (!address) return [];
      return [
        {
          address,
          name: profile.name,
          email: profile.email ?? "",
          password: profile.password ?? "",
          memberCode: profile.member_code ?? "",
          idStatus: statusOf(profile.id_status),
          kinName: profile.kin_name ?? "",
          kinContact: profile.kin_contact ?? "",
          phones: phones
            .filter((item) => same(item.address, address))
            .sort((left, right) => num(left.position) - num(right.position))
            .map((item) => item.phone),
        },
      ];
    }),
    drafts: drafts.flatMap((draft) => {
      const creator = asAddress(draft.creator);
      if (!creator) return [];
      return [
        {
          id: draft.id,
          creator,
          contribution: draft.contribution,
          cycles: num(draft.cycles),
          cycle: draft.cycle,
          days: draft.days,
          open: Boolean(draft.is_open),
          members: members.flatMap((item) => {
            if (item.draft_id !== draft.id) return [];
            const address = asAddress(item.address);
            return address ? [address] : [];
          }),
          applications: applications.flatMap((item) => {
            if (item.draft_id !== draft.id) return [];
            const address = asAddress(item.address);
            return address ? [{ address, name: item.name }] : [];
          }),
        },
      ];
    }),
  };
}

async function writeBucket(bucket: Bucket, store: Store) {
  await transaction(async (query) => {
    await query(sql`DELETE FROM ${table(bucket, "applications")}`);
    await query(sql`DELETE FROM ${table(bucket, "draft_members")}`);
    await query(sql`DELETE FROM ${table(bucket, "drafts")}`);
    await query(sql`DELETE FROM ${table(bucket, "phones")}`);
    await query(sql`DELETE FROM ${table(bucket, "profiles")}`);
    for (const profile of store.profiles) {
      await query(
        sql`INSERT INTO ${table(bucket, "profiles")} (address, name, email, password, member_code, id_status, kin_name, kin_contact) VALUES (${profile.address}, ${profile.name}, ${profile.email}, ${profile.password}, ${profile.memberCode}, ${profile.idStatus}, ${profile.kinName}, ${profile.kinContact})`,
      );
      for (let index = 0; index < profile.phones.length; index += 1) {
        await query(
          sql`INSERT INTO ${table(bucket, "phones")} (address, phone, position) VALUES (${profile.address}, ${profile.phones[index]}, ${index})`,
        );
      }
    }
    for (const draft of store.drafts) {
      await query(
        sql`INSERT INTO ${table(bucket, "drafts")} (id, creator, contribution, cycles, cycle, days, is_open) VALUES (${draft.id}, ${draft.creator}, ${draft.contribution}, ${draft.cycles}, ${draft.cycle}, ${draft.days}, ${draft.open})`,
      );
      for (let index = 0; index < draft.members.length; index += 1) {
        await query(
          sql`INSERT INTO ${table(bucket, "draft_members")} (draft_id, position, address) VALUES (${draft.id}, ${index}, ${draft.members[index]})`,
        );
      }
      for (const application of draft.applications) {
        await query(
          sql`INSERT INTO ${table(bucket, "applications")} (draft_id, address, name) VALUES (${draft.id}, ${application.address}, ${application.name})`,
        );
      }
    }
  });
}

function localFile(): Store {
  try {
    const parsed = JSON.parse(readFileSync(path.join(process.cwd(), "data", "circle.json"), "utf8")) as Store;
    return {
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [],
    };
  } catch {
    return empty();
  }
}

let boot: Promise<void> | null = null;

function ready() {
  boot ??= bootWorld().catch((error) => {
    boot = null;
    throw error;
  });
  return boot;
}

async function bootWorld() {
  await ensureSchema();
  await importLocal();
}

async function importLocal() {
  const flag = await rows<{ value: string }>(sql`SELECT value FROM app.meta WHERE key = ${"circle_file"}`);
  if (flag.length > 0) return;
  const file = localFile();
  const demo = await readBucket("demo");
  const app = await readBucket("app");
  for (const profile of file.profiles) {
    const address = asAddress(profile.address);
    if (!address) continue;
    const bucket = bucketFor(address);
    const store = bucket === "demo" ? demo : app;
    const next = {
      ...profile,
      address,
      phones: profile.phones ?? [],
      email: profile.email ?? "",
      password: profile.password ?? "",
      memberCode: profile.memberCode ?? "",
      idStatus: statusOf(profile.idStatus),
      kinName: profile.kinName ?? "",
      kinContact: profile.kinContact ?? "",
    };
    const index = store.profiles.findIndex((item) => same(item.address, address));
    if (index >= 0) store.profiles[index] = next;
    else store.profiles.push(next);
  }
  for (const draft of file.drafts) {
    const creator = asAddress(draft.creator);
    if (!creator) continue;
    const store = bucketFor(creator) === "demo" ? demo : app;
    store.drafts.push({ ...draft, creator });
  }
  await writeBucket("demo", demo);
  await writeBucket("app", app);
  await rows(sql`INSERT INTO app.meta (key, value) VALUES (${"circle_file"}, ${"1"})`);
}

async function world(): Promise<World> {
  await ready();
  const [demo, app] = await Promise.all([readBucket("demo"), readBucket("app")]);
  return { demo, app };
}

function locate(data: World, id: string): { bucket: Bucket; draft: Draft } | null {
  for (const bucket of buckets) {
    const draft = data[bucket].drafts.find((item) => item.id === id);
    if (draft) return { bucket, draft };
  }
  return null;
}

function same(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function asAddress(value: string): Address | null {
  return isAddress(value) ? getAddress(value) : null;
}

function profileFor(store: Store, address: string) {
  return store.profiles.find((item) => same(item.address, address));
}

function named(data: World, address: Address) {
  for (const bucket of buckets) {
    const profile = profileFor(data[bucket], address);
    if (profile?.name && profile.name !== "Wallet") return profile.name;
  }
  return personName(address);
}

function primaryPhone(data: World, address: string) {
  const home = profileFor(data[bucketFor(address)], address)?.phones[0];
  if (home) return home;
  for (const bucket of buckets) {
    const phone = profileFor(data[bucket], address)?.phones[0];
    if (phone) return phone;
  }
  return "";
}

function ensureProfile(store: Store, who: Viewer): Profile {
  const found = profileFor(store, who.address);
  if (found) {
    found.name = who.name;
    found.address = who.address;
    return found;
  }
  const created: Profile = {
    address: who.address,
    name: who.name,
    phones: [],
    email: "",
    password: "",
    memberCode: "",
    idStatus: "none",
    kinName: "",
    kinContact: "",
  };
  store.profiles.push(created);
  return created;
}

type Key = { kind: "email" | "phone" | "password"; key: string };

function classify(raw: string): Key {
  const value = raw.trim();
  if (!value) throw new Error("Enter an email, phone number, or password.");
  if (value.includes("@")) {
    const email = value.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 80) {
      throw new Error("That email does not look complete.");
    }
    return { kind: "email", key: email };
  }
  const compact = value.replace(/[\s().-]/g, "");
  if (/^\+?\d{7,15}$/.test(compact)) return { kind: "phone", key: compact.replace(/^\+/, "") };
  if (value.length < 4 || value.length > 32) {
    throw new Error("Use a password between 4 and 32 characters, or a phone number with the country code.");
  }
  return { kind: "password", key: value };
}

function matches(profile: Profile, key: Key) {
  if (key.kind === "email") return profile.email === key.key;
  if (key.kind === "phone") return profile.phones.includes(key.key);
  return profile.password === key.key;
}

function holder(data: World, key: Key) {
  for (const bucket of buckets) {
    const found = data[bucket].profiles.find((item) => matches(item, key));
    if (found) return found;
  }
  return undefined;
}

function miss(kind: Key["kind"]) {
  const label = kind === "email" ? "email" : kind === "phone" ? "phone number" : "password";
  return `No wallet is linked to that ${label}. They can add it in Settings.`;
}

function owned(data: World, id: string, who: Viewer) {
  const found = locate(data, id);
  if (!found || !same(found.draft.creator, who.address)) throw new Error("Only the organizer can change this group.");
  return found;
}

function view(data: World, draft: Draft, who: Viewer): DraftView {
  const mine = same(draft.creator, who.address);
  const plan = cyclePlan(draft.cycle, Number(draft.days));
  return {
    id: draft.id,
    contribution: draft.contribution,
    cycles: draft.cycles,
    summary: plan
      ? `${draft.contribution} USDCx each cycle, ${draft.cycles} cycles of ${spanLabel(plan.cycle)}.`
      : `${draft.contribution} USDCx each cycle.`,
    open: draft.open,
    mine,
    member: draft.members.some((item) => same(item, who.address)),
    applied: draft.applications.some((item) => same(item.address, who.address)),
    members: draft.members.flatMap((address) => {
      const account = asAddress(address);
      if (!account) return [];
      return [
        {
          address: account,
          name: named(data, account),
          phone: mine ? primaryPhone(data, account) : "",
          you: same(account, who.address),
          organizer: same(account, draft.creator),
        },
      ];
    }),
    applications: mine
      ? draft.applications.flatMap((item) => {
          const account = asAddress(item.address);
          return account ? [{ address: account, name: item.name || named(data, account) }] : [];
        })
      : [],
  };
}

export async function contactOf(address: Address): Promise<Contact> {
  const data = await world();
  const profile = profileFor(data[bucketFor(address)], address);
  return {
    phones: profile?.phones ?? [],
    email: profile?.email ?? "",
    passwordSet: Boolean(profile?.password),
    memberCode: profile?.memberCode ?? "",
    idStatus: profile?.idStatus ?? "none",
    kinName: profile?.kinName ?? "",
    kinContact: profile?.kinContact ?? "",
  };
}

const blankContact: Contact = {
  phones: [],
  email: "",
  passwordSet: false,
  memberCode: "",
  idStatus: "none",
  kinName: "",
  kinContact: "",
};

export async function contactIfReady(address: Address): Promise<{ contact: Contact; down: boolean }> {
  try {
    return { contact: await contactOf(address), down: false };
  } catch {
    return { contact: blankContact, down: true };
  }
}

export async function draftsIfReady(address: Address): Promise<{ drafts: DraftCard[]; down: boolean }> {
  try {
    return { drafts: await visibleDrafts(address), down: false };
  } catch {
    return { drafts: [], down: true };
  }
}

function statusOf(value: string | undefined): IdStatus {
  if (value === "submitted" || value === "checked") return value;
  return "none";
}

export async function saveIdentity(input: { memberCode: string; idStatus: string; kinName: string; kinContact: string }) {
  const code = input.memberCode.trim().toLowerCase();
  if (code && !/^[a-z0-9]{3,16}$/.test(code)) throw new Error("Use 3 to 16 letters or numbers for the member code.");
  if (input.idStatus === "checked") throw new Error("An organizer confirms an ID. You can mark it as submitted.");
  const status = statusOf(input.idStatus);
  const kinName = input.kinName.trim();
  const kinContact = input.kinContact.trim();
  if (kinName.length > 64) throw new Error("Keep the next of kin name to 64 characters.");
  if (kinContact.length > 40) throw new Error("Keep the next of kin contact to 40 characters.");
  const who = await viewer();
  const data = await world();
  const taken = buckets.some((bucket) =>
    data[bucket].profiles.some((item) => item.memberCode.toLowerCase() === code && code.length > 0 && !same(item.address, who.address)),
  );
  if (taken) throw new Error("That member code is already in use.");
  const bucket = bucketFor(who.address);
  const profile = ensureProfile(data[bucket], who);
  profile.idStatus = profile.idStatus === "checked" ? "checked" : status;
  profile.memberCode = code;
  profile.kinName = kinName;
  profile.kinContact = kinContact;
  await writeBucket(bucket, data[bucket]);
}

export async function visibleDrafts(address: Address): Promise<DraftCard[]> {
  const data = await world();
  return buckets.flatMap((bucket) => data[bucket].drafts).flatMap((draft) => {
    const organizer = same(draft.creator, address);
    const member = draft.members.some((item) => same(item, address));
    const applied = draft.applications.some((item) => same(item.address, address));
    if (!organizer && !member && !draft.open && !applied) return [];
    const plan = cyclePlan(draft.cycle, Number(draft.days));
    const role = organizer ? "organizer" : member ? "member" : applied ? "applied" : "open";
    return [
      {
        id: draft.id,
        contribution: draft.contribution,
        cycles: draft.cycles,
        cycleLabel: plan ? spanLabel(plan.cycle) : "a custom cycle",
        count: draft.members.length,
        role,
      },
    ];
  });
}

export async function readDraft(id: string): Promise<DraftView | null> {
  const who = await viewer();
  const data = await world();
  const found = locate(data, id);
  if (!found) return null;
  const { draft } = found;
  const mine = same(draft.creator, who.address);
  const member = draft.members.some((item) => same(item, who.address));
  const applied = draft.applications.some((item) => same(item.address, who.address));
  if (!mine && !member && !draft.open && !applied) return null;
  return view(data, draft, who);
}

export async function savePhone(raw: string) {
  const key = classify(raw);
  if (key.kind !== "phone") throw new Error("Enter the phone number with the country code.");
  const who = await viewer();
  const data = await world();
  const taken = holder(data, key);
  if (taken && !same(taken.address, who.address)) throw new Error("That phone number is linked to another wallet.");
  const bucket = bucketFor(who.address);
  const store = data[bucket];
  const profile = ensureProfile(store, who);
  if (profile.phones.includes(key.key)) throw new Error("That number is already on your profile.");
  if (profile.phones.length >= 3) throw new Error("A profile can hold 3 phone numbers.");
  profile.phones.push(key.key);
  await writeBucket(bucket, store);
}

export async function dropPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  const who = await viewer();
  const data = await world();
  const bucket = bucketFor(who.address);
  const profile = profileFor(data[bucket], who.address);
  if (!profile) return;
  profile.phones = profile.phones.filter((item) => item !== digits);
  profile.name = who.name;
  await writeBucket(bucket, data[bucket]);
}

export async function saveEmail(raw: string) {
  const value = raw.trim();
  const who = await viewer();
  const data = await world();
  const bucket = bucketFor(who.address);
  const profile = ensureProfile(data[bucket], who);
  if (!value) {
    profile.email = "";
    await writeBucket(bucket, data[bucket]);
    return;
  }
  const key = classify(value);
  if (key.kind !== "email") throw new Error("That email does not look complete.");
  const taken = holder(data, key);
  if (taken && !same(taken.address, who.address)) throw new Error("That email is linked to another wallet.");
  profile.email = key.key;
  await writeBucket(bucket, data[bucket]);
}

export async function savePassword(raw: string) {
  const value = raw.trim();
  const who = await viewer();
  const data = await world();
  const bucket = bucketFor(who.address);
  const profile = ensureProfile(data[bucket], who);
  if (!value) {
    profile.password = "";
    await writeBucket(bucket, data[bucket]);
    return;
  }
  if (value.length < 4 || value.length > 32) throw new Error("Use a password between 4 and 32 characters.");
  const key: Key = { kind: "password", key: value };
  const taken = holder(data, key);
  if (taken && !same(taken.address, who.address)) throw new Error("That password is already linked to another wallet. Choose a different one.");
  profile.password = value;
  await writeBucket(bucket, data[bucket]);
}

export async function openDraft(input: { contribution: string; cycles: number; cycle: string; days: string }) {
  const contribution = input.contribution.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(contribution) || Number(contribution) <= 0) {
    throw new Error("Enter a contribution greater than zero.");
  }
  if (![4, 8, 12].includes(input.cycles)) throw new Error("Choose 4, 8, or 12 cycles.");
  if (!cyclePlan(input.cycle, Number(input.days))) {
    throw new Error("That cycle length is outside what the contract allows. Use 1 to 366 days.");
  }
  const who = await viewer();
  const data = await world();
  const bucket = bucketFor(who.address);
  const store = data[bucket];
  const id = randomBytes(8).toString("hex");
  store.drafts.push({
    id,
    creator: who.address,
    contribution,
    cycles: input.cycles,
    cycle: input.cycle,
    days: String(Number.isInteger(Number(input.days)) ? Number(input.days) : 14),
    members: [who.address],
    open: true,
    applications: [],
  });
  await writeBucket(bucket, store);
  return id;
}

function place(store: Store, draft: Draft, address: Address) {
  if (draft.members.some((item) => same(item, address))) throw new Error("That wallet is already in the group.");
  if (draft.members.length >= MAX_MEMBERS) throw new Error("A group can hold 50 members.");
  draft.members.push(address);
  draft.applications = draft.applications.filter((item) => !same(item.address, address));
}

export async function addDraftMember(id: string, raw: string) {
  const key = classify(raw);
  const who = await viewer();
  const data = await world();
  const { bucket, draft } = owned(data, id, who);
  const found = holder(data, key);
  if (!found) throw new Error(miss(key.kind));
  const account = asAddress(found.address);
  if (!account) throw new Error("That link does not point at a wallet.");
  place(data[bucket], draft, account);
  await writeBucket(bucket, data[bucket]);
}

export async function moveDraftMember(id: string, from: number, dir: -1 | 1) {
  const who = await viewer();
  const data = await world();
  const { bucket, draft } = owned(data, id, who);
  const to = from + dir;
  if (!Number.isInteger(from) || to < 0 || to >= draft.members.length) {
    throw new Error("That person is already at the end of the order.");
  }
  const next = draft.members.slice();
  const hold = next[from];
  next[from] = next[to];
  next[to] = hold;
  draft.members = next;
  await writeBucket(bucket, data[bucket]);
}

export async function removeDraftMember(id: string, address: string) {
  const who = await viewer();
  const data = await world();
  const { bucket, draft } = owned(data, id, who);
  if (same(address, draft.creator)) throw new Error("The organizer stays in the group.");
  const next = draft.members.filter((item) => !same(item, address));
  if (next.length === draft.members.length) throw new Error("That person is not in the group.");
  draft.members = next;
  await writeBucket(bucket, data[bucket]);
}

export async function applyToDraft(id: string) {
  const who = await viewer();
  const data = await world();
  const found = locate(data, id);
  const draft = found?.draft;
  if (!found || !draft || !draft.open) throw new Error("This group is not taking applications.");
  if (draft.members.some((item) => same(item, who.address))) throw new Error("You are already in this group.");
  if (draft.applications.some((item) => same(item.address, who.address))) throw new Error("You already applied.");
  draft.applications.push({ address: who.address, name: who.name });
  await writeBucket(found.bucket, data[found.bucket]);
}

export async function acceptApplicant(id: string, address: string) {
  const who = await viewer();
  const data = await world();
  const { bucket, draft } = owned(data, id, who);
  const account = asAddress(address);
  if (!account || !draft.applications.some((item) => same(item.address, account))) {
    throw new Error("That application is no longer waiting.");
  }
  place(data[bucket], draft, account);
  await writeBucket(bucket, data[bucket]);
}

export async function declineApplicant(id: string, address: string) {
  const who = await viewer();
  const data = await world();
  const { bucket, draft } = owned(data, id, who);
  draft.applications = draft.applications.filter((item) => !same(item.address, address));
  await writeBucket(bucket, data[bucket]);
}

export async function setDraftOpen(id: string, open: boolean) {
  const who = await viewer();
  const data = await world();
  const { bucket, draft } = owned(data, id, who);
  draft.open = open;
  await writeBucket(bucket, data[bucket]);
}

export async function deleteDraft(id: string) {
  const who = await viewer();
  const data = await world();
  const { bucket } = owned(data, id, who);
  data[bucket].drafts = data[bucket].drafts.filter((item) => item.id !== id);
  await writeBucket(bucket, data[bucket]);
}

export async function groupCreateIntent(draftId: string) {
  const who = await viewer();
  const data = await world();
  const { draft } = owned(data, draftId, who);
  if (draft.members.length < 3) throw new Error("Add at least 3 people before the group can start.");
  const plan = cyclePlan(draft.cycle, Number(draft.days));
  if (!plan) throw new Error("That cycle length is outside what the contract allows. Use 1 to 366 days.");
  const members = draft.members.flatMap((item) => {
    const account = asAddress(item);
    return account ? [account] : [];
  });
  const phones = members.flatMap((account) => {
    const phone = primaryPhone(data, account);
    return phone ? [{ account, phone }] : [];
  });
  return {
    kind: "groupCreate" as const,
    draftId,
    contribution: draft.contribution,
    members,
    cycles: draft.cycles,
    cycleSeconds: plan.cycle,
    windowSeconds: plan.window,
    graceSeconds: plan.grace,
    phones,
    ref: "",
  };
}

export async function launchDraft(id: string) {
  const who = await viewer();
  const data = await world();
  const { bucket, draft } = owned(data, id, who);
  if (draft.members.length < 3) throw new Error("Add at least 3 people before the group can start.");
  const plan = cyclePlan(draft.cycle, Number(draft.days));
  if (!plan) throw new Error("That cycle length is outside what the contract allows. Use 1 to 366 days.");
  const members = draft.members.flatMap((item) => {
    const account = asAddress(item);
    return account ? [account] : [];
  });
  const phones = members.flatMap((account) => {
    const phone = primaryPhone(data, account);
    return phone ? [{ account, phone }] : [];
  });
  const index = await accountIndex();
  const chainId = await openGroup(index, {
    contribution: draft.contribution,
    members,
    cycles: draft.cycles,
    cycleSeconds: plan.cycle,
    windowSeconds: plan.window,
    graceSeconds: plan.grace,
  });
  const fresh = await world();
  const current = locate(fresh, id);
  if (current) {
    fresh[current.bucket].drafts = fresh[current.bucket].drafts.filter((item) => item.id !== id);
    await writeBucket(current.bucket, fresh[current.bucket]);
  }
  if (chainId && phones.length) {
    try {
      await publishPhones(index, BigInt(chainId), phones);
    } catch {
      // The group is already open. A member can link a number from the group page.
    }
  }
  return chainId;
}

export async function phoneFor(address: Address) {
  return primaryPhone(await world(), address);
}
