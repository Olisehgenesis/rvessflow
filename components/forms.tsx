"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ErrorNote } from "@/components/ui-bits";
import {
  createLock,
  createSaving,
  createStream,
  doAddFunds,
  doBreak,
  doGroup,
  doLockTop,
  doMature,
  doRelease,
  doVault,
  switchAccount,
  type ActionState,
} from "@/lib/actions";
import type { Person } from "@/lib/protocol";
import { DateField, addDays, dateProblem, formatDay, secondsUntilEnd, startOfDay, streamWindow } from "@/components/date-field";

const field = "h-12 rounded-2xl border-border bg-white px-4 text-base shadow-none";
const FLOW_MIN = 60;
const LOCK_MIN = 3600;

function Submit({ pending, children }: { pending: boolean; children: string }) {
  return (
    <Button type="submit" disabled={pending} className="h-12 w-full rounded-full text-base">
      {pending ? "Sending…" : children}
    </Button>
  );
}

export function AccountSwitch({ people, current }: { people: Person[]; current: string }) {
  return (
    <div className="grid gap-2">
      {people.map((person, index) => {
        const on = person.address.toLowerCase() === current.toLowerCase();
        return (
          <form action={switchAccount} key={person.address}>
          <input type="hidden" name="index" value={index} />
          <button
            type="submit"
            className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left ${on ? "border-foreground bg-muted" : "border-border bg-card"}`}
          >
            <span>
              <span className="block font-medium">{person.name}</span>
              <span className="block text-xs text-muted-foreground">{person.address}</span>
            </span>
            {on ? <span className="text-xs font-semibold text-foreground">Using</span> : null}
          </button>
          </form>
        );
      })}
    </div>
  );
}

export function SavingForm() {
  const [state, action, pending] = useActionState(createSaving, null);
  const [end, setEnd] = useState(() => addDays(startOfDay(new Date()), 180));
  const duration = secondsUntilEnd(end);
  const problem = dateProblem(duration, FLOW_MIN);
  const today = startOfDay(new Date());
  return (
    <form action={action} className="space-y-4">
      <Field label="Name" name="name" placeholder="Emergency fund" />
      <Field label="Set aside now" name="amount" placeholder="300" inputMode="decimal" />
      <Field label="Target" name="target" placeholder="1000" inputMode="decimal" hint="The target can be larger than this deposit. Nothing is streamed." />
      <DateField
        label="Ends"
        hint={`Today is ${formatDay(today)}. The money holds until the selected day.`}
        value={end}
        onChange={setEnd}
        min={today}
        max={addDays(today, 30 * 365 - 1)}
      />
      <input type="hidden" name="duration" value={problem ? "" : duration} />
      {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
      <ErrorNote error={state?.error} />
      <Submit pending={pending || Boolean(problem)}>Create goal</Submit>
    </form>
  );
}

export function StreamForm({ kind, people, me }: { kind: "flow" | "expense"; people: Person[]; me: string }) {
  const [state, action, pending] = useActionState(createStream, null);
  const today = startOfDay(new Date());
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(() => addDays(today, 180));
  const window = streamWindow(start, end);
  const problem = startOfDay(end) < startOfDay(start) ? "The end date has to be on or after the start date." : dateProblem(window.duration, FLOW_MIN);
  const others = people.filter((person) => person.address.toLowerCase() !== me.toLowerCase());
  const latest = addDays(today, 30 * 365 - 1);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="kind" value={kind} />
      <Field label="Name" name="name" placeholder={kind === "expense" ? "Rent" : "Monthly flow"} />
      <Field label="Amount" name="amount" placeholder="200" inputMode="decimal" />
      {kind === "expense" ? (
        <label className="block space-y-1.5">
          <Label>Send to</Label>
          <select name="recipient" className={`${field} w-full`} defaultValue={others[0]?.address}>
            {others.map((person) => (
              <option key={person.address} value={person.address}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-sm text-muted-foreground">This streams the amount back to you. The goal is the amount that will actually move, after the per-second rate is rounded.</p>
      )}
      <DateField label="Starts" hint={window.startAt === 0 ? "Starts today." : `Starts ${formatDay(start)}.`} value={start} onChange={setStart} min={today} max={latest} />
      <DateField label="Ends" hint="The stream runs until the end of this day." value={end} onChange={setEnd} min={start} max={latest} />
      <input type="hidden" name="startAt" value={problem ? "" : window.startAt} />
      <input type="hidden" name="duration" value={problem ? "" : window.duration} />
      {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
      <p className="text-sm text-muted-foreground">
        A stream also sets aside the Superfluid deposit and a one-hour cushion. The wallet deposit covers that. Pausing or settling still needs someone to call the contract.
      </p>
      <ErrorNote error={state?.error} />
      <Submit pending={pending || Boolean(problem)}>{kind === "expense" ? "Start expense" : "Start flow"}</Submit>
    </form>
  );
}

export function LockForm({ penalty, yieldBudget }: { penalty: number; yieldBudget: string }) {
  const [state, action, pending] = useActionState(createLock, null);
  const [earn, setEarn] = useState(false);
  const [end, setEnd] = useState(() => addDays(startOfDay(new Date()), 180));
  const duration = secondsUntilEnd(end);
  const problem = dateProblem(duration, LOCK_MIN);
  const today = startOfDay(new Date());
  const funded = BigInt(yieldBudget) > 0n;
  return (
    <form action={action} className="space-y-4">
      <Field label="Name" name="name" placeholder="Vacation" />
      <Field label="Lock amount" name="amount" placeholder="1000" inputMode="decimal" />
      <Field label="Target" name="target" placeholder="1000" inputMode="decimal" hint="You can top up later. The end date stays." />
      <DateField
        label="Unlocks"
        hint={`Today is ${formatDay(today)}. The principal stays locked until that day.`}
        value={end}
        onChange={setEnd}
        min={today}
        max={addDays(today, 30 * 365 - 1)}
      />
      <input type="hidden" name="duration" value={problem ? "" : duration} />
      {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
      <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
        <div>
          <p className="text-sm font-medium">Earn yield</p>
          <p className="text-xs text-muted-foreground">
            {funded ? "A reward budget is funded. The rate is whatever the admin set." : "No reward budget is funded, so this will not pay yield."}
          </p>
        </div>
        <Switch checked={earn} onCheckedChange={setEarn} />
        <input type="hidden" name="yield" value={earn ? "on" : "off"} />
      </div>
      <p className="text-sm text-muted-foreground">Leaving early costs {(penalty / 100).toFixed(2).replace(/\.00$/, "")}% of the principal. That rate is copied onto the lock and does not change later.</p>
      <ErrorNote error={state?.error} />
      <Submit pending={pending || Boolean(problem)}>Lock now</Submit>
    </form>
  );
}

export function AmountAction({
  id,
  action,
  label,
  name = "amount",
}: {
  id: string;
  action: (state: ActionState, data: FormData) => Promise<ActionState>;
  label: string;
  name?: string;
}) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <Input name={name} inputMode="decimal" placeholder="Amount" className={field} required />
      <ErrorNote error={state?.error} />
      <Submit pending={pending}>{label}</Submit>
    </form>
  );
}

export function AddFunds(props: { id: string }) {
  return <AmountAction {...props} action={doAddFunds} label="Add funds" />;
}
export function ReleaseFunds(props: { id: string }) {
  return <AmountAction {...props} action={doRelease} label="Move back to idle" />;
}
export function TopUpLock(props: { id: string }) {
  return <AmountAction {...props} action={doLockTop} label="Top up" />;
}

export function NamedAction({ id, fn, action, label, tone = "primary" }: { id: string; fn: string; action: (state: ActionState, data: FormData) => Promise<ActionState>; label: string; tone?: "primary" | "quiet" }) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="fn" value={fn} />
      <ErrorNote error={state?.error} />
      <Button type="submit" disabled={pending} variant={tone === "quiet" ? "outline" : "default"} className="h-12 w-full rounded-full text-base">
        {pending ? "Sending…" : label}
      </Button>
    </form>
  );
}

export function VaultButtons({ id, paused, canSettle }: { id: string; paused: boolean; canSettle: boolean }) {
  return (
    <div className="space-y-2">
      {paused ? <NamedAction id={id} fn="resume" action={doVault} label="Resume" /> : <NamedAction id={id} fn="pause" action={doVault} label="Pause" />}
      {canSettle ? <NamedAction id={id} fn="settle" action={doVault} label="Settle and free the slot" /> : null}
      <NamedAction id={id} fn="cancel" action={doVault} label="Close and return funds" tone="quiet" />
    </div>
  );
}

export function WithdrawIdle({ amount }: { amount: string }) {
  return <NamedAction id={amount} fn="withdraw" action={doVault} label="Move idle USDCx to this wallet" tone="quiet" />;
}

export function BreakLock({ id }: { id: string }) {
  return <NamedAction id={id} fn="break" action={doBreak} label="Break early" tone="quiet" />;
}
export function MatureLock({ id }: { id: string }) {
  return <NamedAction id={id} fn="mature" action={doMature} label="Withdraw" />;
}
export function GroupButton({ id, fn, label }: { id: string; fn: string; label: string }) {
  return <NamedAction id={id} fn={fn} action={doGroup} label={label} />;
}

function Field({ label, hint, ...props }: React.ComponentProps<typeof Input> & { label: string; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <Label>{label}</Label>
      <Input {...props} className={field} />
      {hint ? <span className="block text-xs leading-relaxed text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

