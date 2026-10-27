"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSignedAction } from "@/components/sign-action";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorNote } from "@/components/ui-bits";
import {
  acceptJoin,
  addMember,
  addPhone,
  applyJoin,
  createDraft,
  declineJoin,
  keepEmail,
  keepIdentity,
  keepPassword,
  moveMember,
  moveTurn,
  removeDraft,
  removeMember,
  removePhone,
  startDraft,
  toggleApplications,
  useMyPhone,
  type ActionState,
} from "@/lib/actions";
import { cyclePlan, spanLabel, type CycleChoice } from "@/lib/cycle";
import type { Contact, DraftView } from "@/lib/circle";

const field = "h-12 rounded-2xl border-border bg-white px-4 text-base shadow-none";

function Submit({ pending, children, quiet = false }: { pending: boolean; children: React.ReactNode; quiet?: boolean }) {
  return (
    <Button type="submit" disabled={pending} variant={quiet ? "outline" : "default"} className="h-12 w-full rounded-full text-base">
      {pending ? "Saving…" : children}
    </Button>
  );
}

function Saved({ saved }: { saved?: boolean }) {
  if (!saved) return null;
  return (
    <p role="status" className="text-sm font-medium">
      Saved
    </p>
  );
}

export function DraftTerms() {
  const [state, action, pending] = useActionState(createDraft, null);
  const [choice, setChoice] = useState<CycleChoice>("hour");
  const [days, setDays] = useState("14");
  const plan = cyclePlan(choice, Number(days));
  return (
    <form action={action} className="space-y-4">
      <label className="block space-y-1.5">
        <Label htmlFor="contribution">Each contribution</Label>
        <Input id="contribution" name="contribution" placeholder="100" inputMode="decimal" className={field} aria-invalid={Boolean(state?.error)} />
        <span className="block text-xs leading-relaxed text-muted-foreground">Each member posts contribution × cycles as collateral before the rotation can start.</span>
      </label>
      <label className="block space-y-1.5">
        <Label htmlFor="payout">How each turn is paid</Label>
        <select id="payout" name="payout" className={`${field} w-full`} defaultValue="plain">
          <option value="plain">Paid each turn</option>
          <option value="stream">Streaming pot</option>
        </select>
        <span className="block text-xs leading-relaxed text-muted-foreground">Paid each turn sends the contribution to the person whose turn it is. A streaming pot pays that person every second. Paid each turn is an upgrade coming soon, on Thursday, 29 October.</span>
      </label>
      <label className="block space-y-1.5">
        <Label htmlFor="cycles">Cycles</Label>
        <select id="cycles" name="cycles" className={`${field} w-full`} defaultValue="4">
          <option value="4">4 cycles</option>
          <option value="8">8 cycles</option>
          <option value="12">12 cycles</option>
        </select>
      </label>
      <label className="block space-y-1.5">
        <Label htmlFor="cycle">Each cycle</Label>
        <select id="cycle" name="cycle" className={`${field} w-full`} value={choice} onChange={(event) => setChoice(event.target.value as CycleChoice)}>
          <option value="hour">Hour</option>
          <option value="week">Week</option>
          <option value="month">Month, 30 days</option>
          <option value="year">Year, 365 days</option>
          <option value="custom">Custom days</option>
        </select>
      </label>
      {choice === "custom" ? (
        <label className="block space-y-1.5">
          <Label htmlFor="days">Days</Label>
          <Input id="days" name="days" inputMode="numeric" value={days} onChange={(event) => setDays(event.target.value)} className={field} />
        </label>
      ) : (
        <input type="hidden" name="days" value={days} />
      )}
      <p className="text-sm text-muted-foreground">
        {plan
          ? `Each cycle lasts ${spanLabel(plan.cycle)}. Members have ${spanLabel(plan.window)} to pay, then ${spanLabel(plan.grace)} of grace. You add people on the next step.`
          : "Enter a whole number of days from 1 to 366."}
      </p>
      <ErrorNote error={state?.error} />
      <Submit pending={pending}>Create group</Submit>
    </form>
  );
}

function RowMove({ id, from, first, last, action }: { id: string; from: number; first: boolean; last: boolean; action: (state: ActionState, data: FormData) => Promise<ActionState> }) {
  const [state, run, pending] = useSignedAction(action);
  return (
    <form action={run} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="from" value={from} />
      <button type="submit" name="dir" value="up" disabled={pending || first} className="h-9 rounded-full border border-border px-3 text-xs font-medium disabled:opacity-40">
        Up
      </button>
      <button type="submit" name="dir" value="down" disabled={pending || last} className="h-9 rounded-full border border-border px-3 text-xs font-medium disabled:opacity-40">
        Down
      </button>
      <ErrorNote error={state?.error} />
    </form>
  );
}

export function DraftDesk({ draft }: { draft: DraftView }) {
  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-muted-foreground">{draft.summary} Turn 1 receives the first cycle.</p>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Members</h2>
        <ul className="divide-y divide-border border-y border-border">
          {draft.members.map((member, index) => (
            <li key={member.address} className="py-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    Turn {index + 1}
                    <span className="font-normal text-muted-foreground"> · </span>
                    {member.you ? `${member.name} (you)` : member.name}
                    {member.organizer ? " · organizer" : ""}
                  </p>
                  {draft.mine ? (
                    <p className="mt-1 text-xs text-muted-foreground">{member.phone ? member.phone : "No phone linked"}</p>
                  ) : null}
                </div>
              </div>
              {draft.mine ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <RowMove id={draft.id} from={index} first={index === 0} last={index === draft.members.length - 1} action={moveMember} />
                  {member.organizer ? null : <RemovePerson id={draft.id} address={member.address} />}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {draft.mine ? <AddPerson id={draft.id} /> : null}
      </section>
      {draft.mine ? <Applications draft={draft} /> : null}
      {draft.mine ? <ApplicationsSwitch id={draft.id} open={draft.open} /> : null}
      {!draft.mine && !draft.member && draft.open && !draft.applied ? <Apply id={draft.id} /> : null}
      {draft.applied && !draft.member ? <p className="text-sm text-muted-foreground">You applied. The organizer adds you, then sets the order.</p> : null}
      {draft.mine ? <StartGroup id={draft.id} count={draft.members.length} /> : null}
    </div>
  );
}

function AddPerson({ id }: { id: string }) {
  const [state, action, pending] = useActionState(addMember, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <label className="block space-y-1.5">
        <Label htmlFor="who">Add a member</Label>
        <Input id="who" name="who" placeholder="Wallet address, email, phone, or password" autoComplete="off" spellCheck={false} className={field} aria-invalid={Boolean(state?.error)} />
        <span className="block text-xs leading-relaxed text-muted-foreground">Paste any wallet address, or the email, phone, or password they linked in Settings.</span>
      </label>
      <ErrorNote error={state?.error} />
      <Submit pending={pending}>Add member</Submit>
    </form>
  );
}

function RemovePerson({ id, address }: { id: string; address: string }) {
  const [state, action, pending] = useActionState(removeMember, null);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="address" value={address} />
      <button type="submit" disabled={pending} className="h-9 rounded-full border border-border px-3 text-xs font-medium">
        Remove
      </button>
      <ErrorNote error={state?.error} />
    </form>
  );
}

function Applications({ draft }: { draft: DraftView }) {
  if (draft.applications.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">Applications</h2>
      <ul className="divide-y divide-border border-y border-border">
        {draft.applications.map((item) => (
          <li key={item.address} className="flex items-center justify-between gap-3 py-3 text-sm">
            <p className="font-medium">{item.name}</p>
            <div className="flex gap-2">
              <Decision id={draft.id} address={item.address} label="Add" run={acceptJoin} />
              <Decision id={draft.id} address={item.address} label="Decline" run={declineJoin} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Decision({ id, address, label, run }: { id: string; address: string; label: string; run: (state: ActionState, data: FormData) => Promise<ActionState> }) {
  const [state, action, pending] = useActionState(run, null);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="address" value={address} />
      <button type="submit" disabled={pending} className="h-9 rounded-full border border-border px-3 text-xs font-medium">
        {label}
      </button>
      <ErrorNote error={state?.error} />
    </form>
  );
}

function ApplicationsSwitch({ id, open }: { id: string; open: boolean }) {
  const [state, action, pending] = useActionState(toggleApplications, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="open" value={open ? "no" : "yes"} />
      <p className="text-sm text-muted-foreground">{open ? "People can apply to this group." : "Applications are closed."}</p>
      <ErrorNote error={state?.error} />
      <Submit pending={pending} quiet>
        {open ? "Close applications" : "Let people apply"}
      </Submit>
    </form>
  );
}

function Apply({ id, compact = false }: { id: string; compact?: boolean }) {
  const [state, action, pending] = useActionState(applyJoin, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      {compact ? null : <p className="text-sm text-muted-foreground">Apply with this wallet. The organizer adds you and sets your turn.</p>}
      <ErrorNote error={state?.error} />
      <Submit pending={pending}>Apply to join</Submit>
    </form>
  );
}

export function ApplyLink({ id }: { id: string }) {
  return <Apply id={id} compact />;
}

function StartGroup({ id, count }: { id: string; count: number }) {
  const [state, action, pending] = useSignedAction(startDraft);
  const [dropState, drop, dropping] = useActionState(removeDraft, null);
  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-muted-foreground">
        {count < 3
          ? "Add at least 3 people, including you. Starting writes this order onto the group. Everyone then posts collateral, and you start the rotation."
          : "Starting writes these members, in this order, onto the group. Everyone posts collateral, then you start the rotation."}
      </p>
      <form action={action} className="space-y-2">
        <input type="hidden" name="id" value={id} />
        <ErrorNote error={state?.error} />
        <Button type="submit" disabled={pending} className="h-12 w-full rounded-full text-base">
          {pending ? "Starting…" : "Start the group"}
        </Button>
      </form>
      <form action={drop} className="space-y-2">
        <input type="hidden" name="id" value={id} />
        <ErrorNote error={dropState?.error} />
        <Button type="submit" disabled={dropping} variant="outline" className="h-12 w-full rounded-full text-base">
          {dropping ? "Deleting…" : "Delete this draft"}
        </Button>
      </form>
    </div>
  );
}

export function TurnMove({ id, from, first, last }: { id: string; from: number; first: boolean; last: boolean }) {
  return <RowMove id={id} from={from} first={first} last={last} action={moveTurn} />;
}

export function LinkPhone({ id, address }: { id: string; address: string }) {
  const [state, action, pending] = useSignedAction(useMyPhone);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="address" value={address} />
      <ErrorNote error={state?.error} />
      <Submit pending={pending} quiet>
        Link my phone to this group
      </Submit>
    </form>
  );
}

export function ProfileForm({ contact }: { contact: Contact; demo?: boolean }) {
  return (
    <section className="space-y-4 pt-1 pb-4">
      <IdentityField contact={contact} />
      <PhoneList phones={contact.phones} />
      <EmailField email={contact.email} />
      <PasswordField passwordSet={contact.passwordSet} />
    </section>
  );
}

function IdentityField({ contact }: { contact: Contact }) {
  const [state, action, pending] = useActionState(keepIdentity, null);
  return (
    <form action={action} className="space-y-2">
      <label className="block space-y-1.5">
        <Label htmlFor="memberCode">Member code</Label>
        <Input id="memberCode" name="memberCode" defaultValue={contact.memberCode} placeholder="alex84" className={field} aria-invalid={Boolean(state?.error)} />
        <span className="block text-xs leading-relaxed text-muted-foreground">A short code people can use to find this wallet. It is not a national ID.</span>
      </label>
      <label className="block space-y-1.5">
        <Label htmlFor="idStatus">ID on file</Label>
        <select id="idStatus" name="idStatus" defaultValue={contact.idStatus === "checked" ? "submitted" : contact.idStatus} className={`${field} w-full`}>
          <option value="none">Not added</option>
          <option value="submitted">Submitted</option>
        </select>
        <span className="block text-xs leading-relaxed text-muted-foreground">
          {contact.idStatus === "checked"
            ? "An organizer has confirmed an ID for this wallet. The document itself stays off the chain."
            : "Mark submitted when an ID is ready for an organizer. The document stays off the chain."}
        </span>
      </label>
      <label className="block space-y-1.5">
        <Label htmlFor="kinName">Next of kin</Label>
        <Input id="kinName" name="kinName" defaultValue={contact.kinName} placeholder="Name" className={field} />
      </label>
      <label className="block space-y-1.5">
        <Label htmlFor="kinContact">How to reach them</Label>
        <Input id="kinContact" name="kinContact" defaultValue={contact.kinContact} placeholder="Phone or note" className={field} />
      </label>
      <Saved saved={state?.saved} />
      <ErrorNote error={state?.error} />
      <Submit pending={pending} quiet>
        Save profile
      </Submit>
    </form>
  );
}

function PhoneList({ phones }: { phones: string[] }) {
  const [state, action, pending] = useActionState(addPhone, null);
  return (
    <div className="space-y-2">
      {phones.length ? (
        <ul className="divide-y divide-border border-y border-border">
          {phones.map((phone, index) => (
            <li key={phone} className="flex items-center justify-between gap-3 py-3 text-sm">
              <p>
                <span className="font-medium">{phone}</span>
                {index === 0 ? <span className="text-muted-foreground"> · used on groups</span> : null}
              </p>
              <DropPhone phone={phone} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No phone number yet.</p>
      )}
      <form action={action} className="space-y-2">
        <label className="block space-y-1.5">
          <Label htmlFor="phone">Phone number</Label>
          <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="256700000001" className={field} aria-invalid={Boolean(state?.error)} />
          <span className="block text-xs leading-relaxed text-muted-foreground">Include the country code. The first number is the one written onto a group.</span>
        </label>
        <Saved saved={state?.saved} />
        <ErrorNote error={state?.error} />
        <Submit pending={pending} quiet>
          Add number
        </Submit>
      </form>
    </div>
  );
}

function DropPhone({ phone }: { phone: string }) {
  const [state, action, pending] = useActionState(removePhone, null);
  return (
    <form action={action}>
      <input type="hidden" name="phone" value={phone} />
      <button type="submit" disabled={pending} className="h-9 rounded-full border border-border px-3 text-xs font-medium">
        Remove
      </button>
      <ErrorNote error={state?.error} />
    </form>
  );
}

function EmailField({ email }: { email: string }) {
  const [state, action, pending] = useActionState(keepEmail, null);
  return (
    <form action={action} className="space-y-2">
      <label className="block space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" defaultValue={email} placeholder="you@example.com" className={field} aria-invalid={Boolean(state?.error)} />
        <span className="block text-xs leading-relaxed text-muted-foreground">Leave it blank and save to remove it.</span>
      </label>
      <Saved saved={state?.saved} />
      <ErrorNote error={state?.error} />
      <Submit pending={pending} quiet>
        Save email
      </Submit>
    </form>
  );
}

function PasswordField({ passwordSet }: { passwordSet: boolean }) {
  const [state, action, pending] = useActionState(keepPassword, null);
  return (
    <form action={action} className="space-y-2">
      <label className="block space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="off"
          placeholder={passwordSet ? "A password is set" : "Choose a password"}
          className={field}
          aria-invalid={Boolean(state?.error)}
        />
        <span className="block text-xs leading-relaxed text-muted-foreground">
          Anyone who knows it can add this wallet to a group. It is not your sign-in. Leave it blank and save to remove it.
        </span>
      </label>
      <Saved saved={state?.saved} />
      <ErrorNote error={state?.error} />
      <Submit pending={pending} quiet>
        Save password
      </Submit>
    </form>
  );
}
