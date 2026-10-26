"use client";

import { useState } from "react";
import { IconChevron, IconInfo } from "@/components/icons";
import { PayWith, ReceiveWith, type PayChoice } from "@/components/pay-with";
import { useSignedAction } from "@/components/sign-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ErrorNote } from "@/components/ui-bits";
import type { Quote } from "@/lib/quote";
import {
  addMoney,
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
  withdrawUsd,
  type ActionState,
} from "@/lib/actions";
import type { Person } from "@/lib/protocol";
import { DateField, addDays, dateProblem, secondsUntilEnd, startOfDay, streamWindow } from "@/components/date-field";

const field = "h-12 rounded-2xl border-border bg-white px-4 text-base shadow-none";
const FLOW_MIN = 60;
const LOCK_MIN = 3600;

function Submit({ pending, hold = false, children }: { pending: boolean; hold?: boolean; children: string }) {
  return (
    <Button type="submit" disabled={pending || hold} className="h-12 w-full rounded-full text-base">
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
            className={`flex w-full min-w-0 items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left ${on ? "border-foreground bg-muted" : "border-border bg-card"}`}
          >
            <span className="min-w-0">
              <span className="block font-medium">{person.name}</span>
              <span className="block break-all text-xs text-muted-foreground">{person.address}</span>
            </span>
            {on ? <span className="shrink-0 text-xs font-semibold text-foreground">Using</span> : null}
          </button>
          </form>
        );
      })}
    </div>
  );
}

export function SavingForm({ people, me, choices }: { people: Person[]; me: string; choices: PayChoice[] }) {
  const [state, action, pending] = useSignedAction(createSaving);
  const [end, setEnd] = useState(() => addDays(startOfDay(new Date()), 180));
  const duration = secondsUntilEnd(end);
  const problem = dateProblem(duration, FLOW_MIN);
  const today = startOfDay(new Date());
  const options = people.some((person) => person.address.toLowerCase() === me.toLowerCase())
    ? people
    : [{ name: "You", address: me as Person["address"] }, ...people];
  return (
    <form action={action} className="space-y-4">
      <Field label="Name" name="name" placeholder="Emergency fund" />
      <PayWith choices={choices} mode="vault" />
      <label className="block space-y-1.5">
        <Label>Send to</Label>
        <span className="relative block">
          <select name="recipient" className={`${field} w-full appearance-none pr-10`} defaultValue={me}>
            {options.map((person) => (
              <option key={person.address} value={person.address}>
                {person.name}
              </option>
            ))}
          </select>
          <IconChevron className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-foreground" />
        </span>
      </label>
      <div className="rounded-2xl border border-border bg-card px-4 py-3">
        <p className="text-xs text-muted-foreground">Starts</p>
        <p className="mt-0.5 text-sm font-medium">Starts today.</p>
      </div>
      <DateField label="Ends" presentation="ends" value={end} onChange={setEnd} min={today} max={addDays(today, 30 * 365 - 1)} />
      <input type="hidden" name="duration" value={problem ? "" : duration} />
      {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
      <ErrorNote error={state?.error} />
      <Submit pending={pending || Boolean(problem)}>Create goal</Submit>
    </form>
  );
}

export function StreamForm({ kind, people, me, choices }: { kind: "flow" | "expense"; people: Person[]; me: string; choices: PayChoice[] }) {
  const [state, action, pending] = useSignedAction(createStream);
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
      <PayWith choices={choices} mode="stream" duration={problem ? undefined : window.duration} />
      {kind === "expense" ? (
        <label className="block space-y-1.5">
          <Label>Send to</Label>
          <select name="recipient" className={`${field} w-full`} defaultValue={others[0]?.address}>
            {others.length === 0 ? <option value="">No other account yet</option> : null}
            {others.map((person) => (
              <option key={person.address} value={person.address}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-sm text-muted-foreground">This streams the amount back to you.</p>
      )}
      <DateField label="Starts" value={start} onChange={setStart} min={today} max={latest} />
      <DateField label="Ends" presentation="ends" value={end} onChange={setEnd} min={start} max={latest} />
      <input type="hidden" name="startAt" value={problem ? "" : window.startAt} />
      <input type="hidden" name="duration" value={problem ? "" : window.duration} />
      {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
      <ErrorNote error={state?.error} />
      <Submit pending={pending || Boolean(problem)}>Create goal</Submit>
    </form>
  );
}

function penaltyLabel(typed: string, bps: number, quote: Quote) {
  const pct = (bps / 100).toFixed(2).replace(/\.00$/, "");
  const value = Number(typed.replace(/,/g, "").trim());
  if (!Number.isFinite(value) || value <= 0) return `${pct}%`;
  const fee = (value * bps) / 10_000;
  const usd = `USD ${fee.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (quote.code === "usd" || quote.code === "fusdcx" || !(quote.perToken > 0)) return `${pct}% (${usd})`;
  const local = (fee * quote.perToken).toLocaleString("en-US", { maximumFractionDigits: quote.digits });
  return `${pct}% (${usd} · ${quote.unit} ${local})`;
}

export function LockForm({ penalty, quote, choices }: { penalty: number; quote: Quote; choices: PayChoice[] }) {
  const [state, action, pending] = useSignedAction(createLock);
  const [earn, setEarn] = useState(false);
  const [amount, setAmount] = useState("");
  const [end, setEnd] = useState(() => addDays(startOfDay(new Date()), 180));
  const duration = secondsUntilEnd(end);
  const problem = dateProblem(duration, LOCK_MIN);
  const today = startOfDay(new Date());
  const pct = (penalty / 100).toFixed(2).replace(/\.00$/, "");
  const badAmount = amount.trim() !== "" && !/^\d+(\.\d{1,2})?$/.test(amount.replace(/,/g, "").trim());
  return (
    <form action={action} className="space-y-4">
      <PayWith choices={choices} mode="wallet" protocolOnTop onAmount={setAmount} />
      <DateField label="Unlock date" presentation="unlock" value={end} onChange={setEnd} min={today} max={addDays(today, 30 * 365 - 1)} />
      <input type="hidden" name="duration" value={problem ? "" : duration} />
      {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
      {badAmount ? <p className="text-sm text-destructive">Enter the amount in USD.</p> : null}
      <div className="rounded-2xl bg-muted px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <IconInfo className="size-4" />
          Penalty on early unlock
        </p>
        <p className="mt-1 text-sm font-semibold">{penaltyLabel(amount, penalty, quote)}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Your funds will be locked until the scheduled date. Early unlock will incur a {pct}% penalty.
        </p>
      </div>
      <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
        <div>
          <p className="text-sm font-medium">Earn yield</p>
          <p className="text-xs text-muted-foreground">Paid only when a reward budget is funded for USD.</p>
        </div>
        <Switch checked={earn} onCheckedChange={setEarn} />
        <input type="hidden" name="yield" value={earn ? "on" : "off"} />
      </div>
      <ErrorNote error={state?.error} />
      <Submit pending={pending} hold={Boolean(problem) || badAmount || amount.trim() === ""}>Create lock</Submit>
    </form>
  );
}

export function TokenMark({ symbol }: { symbol: string }) {
  return (
    <span className="grid size-10 place-items-center rounded-full border border-border bg-card text-sm font-semibold">
      {symbol === "ETHx" ? "Ξ" : "$"}
    </span>
  );
}

export function AddMoneyForm({ choices }: { choices: PayChoice[] }) {
  const [state, action, pending] = useSignedAction(addMoney);
  return (
    <form action={action} className="space-y-4">
      <PayWith choices={choices} mode="vault" full />
      <ErrorNote error={state?.error} />
      <Submit pending={pending}>Add money</Submit>
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
  const [state, run, pending] = useSignedAction(action);
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
  return <AmountAction {...props} action={doAddFunds} label="Add to goal" />;
}

export function AddToGoal({ id, choices }: { id: string; choices: PayChoice[] }) {
  const [open, setOpen] = useState(false);
  const [state, run, pending] = useSignedAction(doAddFunds);
  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)} className="h-12 w-full rounded-full text-base">
        Add to goal
      </Button>
    );
  }
  return (
    <form action={run} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <PayWith choices={choices} mode="vault" />
      <ErrorNote error={state?.error} />
      <Submit pending={pending}>Add to goal</Submit>
    </form>
  );
}
export function ReleaseFunds(props: { id: string }) {
  return <AmountAction {...props} action={doRelease} label="Move back to idle" />;
}
export function TopUpLock({ id, choices }: { id: string; choices?: PayChoice[] }) {
  if (!choices) return <AmountAction id={id} action={doLockTop} label="Top up" />;
  return <TopUpUsd id={id} choices={choices} />;
}

function TopUpUsd({ id, choices }: { id: string; choices: PayChoice[] }) {
  const [state, run, pending] = useSignedAction(doLockTop);
  return (
    <form action={run} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <PayWith choices={choices} mode="wallet" protocolOnTop />
      <ErrorNote error={state?.error} />
      <Submit pending={pending}>Top up</Submit>
    </form>
  );
}

export function NamedAction({ id, fn, action, label, tone = "primary" }: { id: string; fn: string; action: (state: ActionState, data: FormData) => Promise<ActionState>; label: string; tone?: "primary" | "quiet" }) {
  const [state, run, pending] = useSignedAction(action);
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
      {paused ? <NamedAction id={id} fn="resume" action={doVault} label="Resume goal" /> : <NamedAction id={id} fn="pause" action={doVault} label="Pause goal" tone="quiet" />}
      {canSettle ? <NamedAction id={id} fn="settle" action={doVault} label="Settle and free the slot" /> : null}
      <NamedAction id={id} fn="cancel" action={doVault} label="Close and return funds" tone="quiet" />
    </div>
  );
}

export function WithdrawForm({ idleUsd }: { idleUsd: string }) {
  const [state, run, pending] = useSignedAction(withdrawUsd);
  return (
    <form action={run} className="space-y-3">
      <p className="text-sm text-muted-foreground">Idle in the vault: ${idleUsd}. USDC is the default. USDT and ETH are swapped after the withdrawal.</p>
      <ReceiveWith />
      <ErrorNote error={state?.error} />
      <Submit pending={pending}>Withdraw</Submit>
    </form>
  );
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

export function GroupPay({
  id,
  fn,
  label,
  superWei,
  choices,
}: {
  id: string;
  fn: string;
  label: string;
  superWei: string;
  choices: PayChoice[];
}) {
  const [state, run, pending] = useSignedAction(doGroup);
  return (
    <form action={run} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="fn" value={fn} />
      <PayWith choices={choices} mode="wallet" fixedSuper={superWei} protocolOnTop />
      <ErrorNote error={state?.error} />
      <Submit pending={pending}>{label}</Submit>
    </form>
  );
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

