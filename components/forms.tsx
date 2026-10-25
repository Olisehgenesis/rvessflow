"use client";

import { useMemo, useState } from "react";
import { parseUnits } from "viem";
import { assets, type Asset } from "@/lib/assets";
import { IconChevron, IconInfo } from "@/components/icons";
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
  type ActionState,
} from "@/lib/actions";
import type { Person } from "@/lib/protocol";
import { DateField, addDays, dateProblem, secondsUntilEnd, startOfDay, streamWindow } from "@/components/date-field";

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

export function SavingForm({ people, me }: { people: Person[]; me: string }) {
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
      <Field label="Amount" name="amount" placeholder="300,000" inputMode="decimal" />
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

export function StreamForm({ kind, people, me }: { kind: "flow" | "expense"; people: Person[]; me: string }) {
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
      <Field label="Amount" name="amount" placeholder="200" inputMode="decimal" />
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

function looseWei(value: string): bigint | null {
  const clean = value.replace(/,/g, "").trim();
  if (!clean) return 0n;
  if (!/^\d+(\.\d{1,18})?$/.test(clean)) return null;
  try {
    return parseUnits(clean, 18);
  } catch {
    return null;
  }
}

function penaltyLabel(typed: string, bps: number, asset: Asset, quote: Quote) {
  const pct = (bps / 100).toFixed(2).replace(/\.00$/, "");
  const value = Number(typed.replace(/,/g, "").trim());
  if (!Number.isFinite(value) || value <= 0) return `${pct}%`;
  const fee = (value * bps) / 10_000;
  const unit = asset.symbol === "ETHx" ? "ETH" : quote.unit;
  const digits = asset.symbol === "ETHx" ? 6 : quote.digits;
  const shown = fee.toLocaleString("en-US", { maximumFractionDigits: digits });
  return `${pct}% (${unit} ${shown})`;
}

export function LockForm({ penalty, quote }: { penalty: number; quote: Quote }) {
  const [state, action, pending] = useSignedAction(createLock);
  const [earn, setEarn] = useState(false);
  const [asset, setAsset] = useState<Asset>(assets[0]);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [end, setEnd] = useState(() => addDays(startOfDay(new Date()), 180));
  const duration = secondsUntilEnd(end);
  const problem = dateProblem(duration, LOCK_MIN);
  const today = startOfDay(new Date());
  const wei = useMemo(() => looseWei(amount), [amount]);
  const pct = (penalty / 100).toFixed(2).replace(/\.00$/, "");
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={asset.address} />
      <input type="hidden" name="name" value={asset.symbol} />
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left">
        <span className="flex items-center gap-3">
          <TokenMark symbol={asset.symbol} />
          <span>
            <span className="block font-medium">{asset.symbol}</span>
            <span className="block text-xs text-muted-foreground">{asset.name}</span>
          </span>
        </span>
        <IconChevron className="size-4 text-muted-foreground" />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Choose asset" className="w-full max-w-lg rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={(event) => event.stopPropagation()}>
            <p className="mb-3 text-base font-medium">Asset</p>
            <ul className="divide-y divide-border">
              {assets.map((item) => (
                <li key={item.address}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 py-3 text-left"
                    onClick={() => {
                      setAsset(item);
                      setOpen(false);
                    }}
                  >
                    <TokenMark symbol={item.symbol} />
                    <span>
                      <span className="block font-medium">{item.symbol}</span>
                      <span className="block text-xs text-muted-foreground">{item.name}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      <label className="block space-y-1.5">
        <Label>Amount</Label>
        <Input name="amount" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="500,000" className={field} required />
      </label>
      <DateField label="Unlock date" presentation="unlock" value={end} onChange={setEnd} min={today} max={addDays(today, 30 * 365 - 1)} />
      <input type="hidden" name="duration" value={problem ? "" : duration} />
      {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
      {wei === null ? <p className="text-sm text-destructive">Enter an amount greater than zero.</p> : null}
      <div className="rounded-2xl bg-muted px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <IconInfo className="size-4" />
          Penalty on early unlock
        </p>
        <p className="mt-1 text-sm font-semibold">{wei === null ? `${pct}%` : penaltyLabel(amount, penalty, asset, quote)}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Your funds will be locked until the scheduled date. Early unlock will incur a {pct}% penalty.
        </p>
      </div>
      <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
        <div>
          <p className="text-sm font-medium">Earn yield</p>
          <p className="text-xs text-muted-foreground">Paid only when a reward budget is funded for {asset.symbol}.</p>
        </div>
        <Switch checked={earn} onCheckedChange={setEarn} />
        <input type="hidden" name="yield" value={earn ? "on" : "off"} />
      </div>
      <ErrorNote error={state?.error} />
      <Submit pending={pending || Boolean(problem) || wei === null || wei === 0n}>Create lock</Submit>
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

export function AddMoneyForm() {
  const [state, action, pending] = useSignedAction(addMoney);
  return (
    <form action={action} className="space-y-4">
      <Field label="Amount" name="amount" placeholder="100" inputMode="decimal" hint="Moves USDCx from this wallet into your vault, including the 0.3% protocol fee." />
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

export function AddToGoal({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)} className="h-12 w-full rounded-full text-base">
        Add to goal
      </Button>
    );
  }
  return <AddFunds id={id} />;
}
export function ReleaseFunds(props: { id: string }) {
  return <AmountAction {...props} action={doRelease} label="Move back to idle" />;
}
export function TopUpLock(props: { id: string }) {
  return <AmountAction {...props} action={doLockTop} label="Top up" />;
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

