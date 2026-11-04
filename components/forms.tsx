"use client";

import { useState } from "react";
import { formatUnits, isAddress, parseUnits } from "viem";
import { IconInfo } from "@/components/icons";
import { ProfileAvatar } from "@/components/profile-avatar";
import { TokenIcon } from "@/components/token-icon";
import { useGoalName } from "@/components/goal-name";
import { PayWith, ReceiveWith, type PayChoice } from "@/components/pay-with";
import { parseGroupKey } from "@/lib/group-network";
import { RecipientField } from "@/components/recipient-field";
import { useSignedAction } from "@/components/sign-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ErrorNote } from "@/components/ui-bits";
import { localFromUsd, priced, shortAddress, showsLocal, usdFromLocal } from "@/lib/display";
import { chainQuote, type Quote } from "@/lib/quote";
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
import { DateField, addDays, dateProblem, formatDay, secondsUntilEnd, spanText, startOfDay, streamWindow } from "@/components/date-field";
import { formatAmount, lockYieldWei, netSuperForUsd, parseUsd } from "@/lib/pay-math";

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
            className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left ${on ? "border-[#C5E36A] bg-[#F3FBD8]" : "border-border bg-card"}`}
          >
            <span className="flex min-w-0 items-center gap-3">
              <ProfileAvatar seed={person.address} className="size-10" />
              <span className="min-w-0">
                <span className="block font-medium">{person.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{shortAddress(person.address)}</span>
              </span>
            </span>
            {on ? <span className="text-xs font-semibold text-foreground">Using</span> : null}
          </button>
          </form>
        );
      })}
    </div>
  );
}

const durationDays = [7, 30, 50, 90, 180, 365];

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 rounded-full px-3 text-xs font-medium ${on ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}
    >
      {label}
    </button>
  );
}

function When({ start, end, onStart, onEnd }: { start: Date; end: Date; onStart: (next: Date) => void; onEnd: (next: Date) => void }) {
  const today = startOfDay(new Date());
  const latest = addDays(today, 30 * 365 - 1);
  const span = Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / 86400000);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <DateField label="Starts" value={start} onChange={onStart} min={today} max={latest} />
        <DateField label="Ends" value={end} onChange={onEnd} min={start} max={latest} summary={`${spanText(start, end)} · ${formatDay(end)}`} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip label="Today" on={startOfDay(start).getTime() === today.getTime()} onClick={() => onStart(today)} />
        <Chip label="Tomorrow" on={startOfDay(start).getTime() === addDays(today, 1).getTime()} onClick={() => onStart(addDays(today, 1))} />
        {durationDays.map((days) => (
          <Chip key={days} label={days === 365 ? "1 year" : `${days}d`} on={span === days} onClick={() => onEnd(addDays(start, days))} />
        ))}
      </div>
    </div>
  );
}

export function SavingForm({ me, choices, quote }: { me: string; choices: PayChoice[]; quote: Quote }) {
  const [state, save, pending] = useSignedAction(createSaving);
  const today = startOfDay(new Date());
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(() => addDays(today, 180));
  const window = streamWindow(start, end);
  const problem = startOfDay(end) < startOfDay(start) ? "The end date has to be on or after the start date." : dateProblem(window.duration, FLOW_MIN);
  const draftName = useGoalName();
  return (
    <form action={save} className="space-y-4">
      <input type="hidden" name="name" value={draftName} />
      <input type="hidden" name="recipient" value={me} />
      <PayWith choices={choices} mode="vault" quote={quote} />
      <When start={start} end={end} onStart={setStart} onEnd={setEnd} />
      <input type="hidden" name="startAt" value={problem ? "" : window.startAt} />
      <input type="hidden" name="duration" value={problem ? "" : window.duration} />
      {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
      <ErrorNote error={state?.error} />
      <Submit pending={pending || Boolean(problem)}>Save</Submit>
    </form>
  );
}

export function StreamForm({ kind, me, choices, quote }: { kind: "flow" | "expense"; me: string; choices: PayChoice[]; quote: Quote }) {
  const [state, action, pending] = useSignedAction(createStream);
  const today = startOfDay(new Date());
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(() => addDays(today, 180));
  const window = streamWindow(start, end);
  const problem = startOfDay(end) < startOfDay(start) ? "The end date has to be on or after the start date." : dateProblem(window.duration, FLOW_MIN);
  const [recipient, setRecipient] = useState("");
  const whoProblem = kind === "expense" && !isAddress(recipient);
  const draftName = useGoalName();
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="name" value={draftName} />
      {kind === "flow" ? <input type="hidden" name="recipient" value={me} /> : null}
      <PayWith choices={choices} mode="stream" duration={problem ? undefined : window.duration} quote={quote} />
      {kind === "expense" ? <RecipientField name="recipient" me={me} value={recipient} onValue={setRecipient} /> : null}
      <When start={start} end={end} onStart={setStart} onEnd={setEnd} />
      <input type="hidden" name="startAt" value={problem ? "" : window.startAt} />
      <input type="hidden" name="duration" value={problem ? "" : window.duration} />
      {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
      <ErrorNote error={state?.error} />
      <Submit pending={pending || Boolean(problem)} hold={whoProblem}>{kind === "expense" ? "Start stream" : "Start flow"}</Submit>
    </form>
  );
}

function lockEarnLabel({
  amount,
  pay,
  quote,
  rate,
  duration,
  usdcUsd8,
  badAmount,
  problem,
}: {
  amount: string;
  pay: string;
  quote: Quote;
  rate: bigint;
  duration: number;
  usdcUsd8: string;
  badAmount: boolean;
  problem: string | null;
}) {
  const typed = amount.replace(/,/g, "").trim();
  if (!typed || badAmount || problem || rate <= 0n) return null;
  try {
    const principal = pay === "gdx" ? parseUnits(typed, 18) : netSuperForUsd(parseUsd(usdFromLocal(typed, quote)), BigInt(usdcUsd8));
    const earned = lockYieldWei(principal, rate, duration);
    if (earned <= 0n) return `Less than 1 ${pay === "gdx" ? "G$" : quote.unit}`;
    if (pay === "gdx") return `About ${formatAmount(earned, 18, 4)} G$`;
    const usd = formatUnits(earned, 18);
    if (showsLocal(quote) && localFromUsd(usd, quote) === "0") return `Less than 1 ${quote.unit}`;
    return `About ${priced(usd, quote)}`;
  } catch {
    return null;
  }
}

function penaltyLabel(typed: string, bps: number, unit: string, digits: number) {
  const pct = (bps / 100).toFixed(2).replace(/\.00$/, "");
  const value = Number(typed.replace(/,/g, "").trim());
  if (!Number.isFinite(value) || value <= 0) return `${pct}%`;
  const fee = (value * bps) / 10_000;
  const shown = fee.toLocaleString("en-US", { maximumFractionDigits: Math.max(digits, 0) });
  return `${pct}% (${unit} ${shown})`;
}

export function LockForm({
  penalty,
  quote,
  choices,
  earnRate = { celo: "0", base: "0", gdx: "0" },
  usdcUsd8 = "100000000",
}: {
  penalty: number;
  quote: Quote;
  choices: PayChoice[];
  /** Wei per second for each 1e18 locked. Zero means yield is not funded, and turning it on would revert. */
  earnRate?: { celo: string; base: string; gdx: string };
  usdcUsd8?: string;
}) {
  const [state, action, pending] = useSignedAction(createLock, { art: "/marks/lock.png", title: "Creating a lock" });
  const [earn, setEarn] = useState(false);
  const [amount, setAmount] = useState("");
  const [pay, setPay] = useState("");
  const [network, setNetwork] = useState("");
  const [end, setEnd] = useState(() => addDays(startOfDay(new Date()), 180));
  const duration = secondsUntilEnd(end);
  const problem = dateProblem(duration, LOCK_MIN);
  const today = startOfDay(new Date());
  const pct = (penalty / 100).toFixed(2).replace(/\.00$/, "");
  const unit = pay === "gdx" ? "G$" : quote.unit;
  const rate = BigInt(pay === "gdx" ? earnRate.gdx : /celo/i.test(network) ? earnRate.celo : earnRate.base);
  const yieldReady = rate > 0n;
  const badAmount = amount.trim() !== "" && !/^\d+(\.\d{1,6})?$/.test(amount.replace(/,/g, "").trim());
  const earned = yieldReady && earn ? lockEarnLabel({ amount, pay, quote, rate, duration, usdcUsd8, badAmount, problem }) : null;
  return (
    <form action={action} className="space-y-4">
      <PayWith
        choices={choices}
        mode="wallet"
        protocolOnTop
        quote={quote}
        onAmount={(next, asset, where) => {
          setAmount(next);
          setPay(asset);
          setNetwork(where ?? "");
          const nextRate = BigInt(asset === "gdx" ? earnRate.gdx : /celo/i.test(where ?? "") ? earnRate.celo : earnRate.base);
          if (nextRate <= 0n) setEarn(false);
        }}
      />
      <DateField label="Unlock date" presentation="unlock" value={end} onChange={setEnd} min={today} max={addDays(today, 30 * 365 - 1)} />
      <input type="hidden" name="duration" value={problem ? "" : duration} />
      {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
      {badAmount ? <p className="text-sm text-destructive">Enter the amount in {unit}.</p> : null}
      <div className="rounded-2xl bg-muted px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <IconInfo className="size-4" />
          Penalty on early unlock
        </p>
        <p className="mt-1 text-sm font-semibold">{penaltyLabel(amount, penalty, unit, pay === "gdx" ? 4 : quote.digits)}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Your funds will be locked until the scheduled date. Early unlock will incur a {pct}% penalty.
        </p>
      </div>
      <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
        <div>
          <p className="text-sm font-medium">Earn yield</p>
          <p className="text-xs text-muted-foreground">
            {earned ? `${earned} by ${formatDay(end)}, while the reward budget lasts.` : yieldReady ? "Paid from the reward budget for this token." : "Not funded for this token yet, so the lock is created without yield."}
          </p>
        </div>
        <Switch checked={earn && yieldReady} disabled={!yieldReady} onCheckedChange={setEarn} />
        <input type="hidden" name="yield" value={earn && yieldReady ? "on" : "off"} />
      </div>
      <ErrorNote error={state?.error} />
      <Submit pending={pending} hold={Boolean(problem) || badAmount || amount.trim() === ""}>Create lock</Submit>
    </form>
  );
}

export function TokenMark({ symbol, network }: { symbol: string; network?: string }) {
  return <TokenIcon symbol={symbol} network={network} className="size-10" />;
}

export function AddMoneyForm({ choices, quote = chainQuote() }: { choices: PayChoice[]; quote?: Quote }) {
  const [state, action, pending] = useSignedAction(addMoney);
  return (
    <form action={action} className="space-y-4">
      <PayWith choices={choices} mode="vault" full quote={quote} />
      <ErrorNote error={state?.error} />
      <Submit pending={pending}>Top up</Submit>
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

export function AddToGoal({ id, choices, quote = chainQuote() }: { id: string; choices: PayChoice[]; quote?: Quote }) {
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
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
      <PayWith choices={choices} mode="vault" quote={quote} stayOn={parseGroupKey(id).net} onBlocked={setBlocked} />
      <ErrorNote error={state?.error} />
      <Submit pending={pending} hold={blocked}>Add to goal</Submit>
    </form>
  );
}
export function ReleaseFunds(props: { id: string }) {
  return <AmountAction {...props} action={doRelease} label="Move back to idle" />;
}
export function TopUpLock({ id, choices, quote = chainQuote() }: { id: string; choices?: PayChoice[]; quote?: Quote }) {
  if (!choices) return <AmountAction id={id} action={doLockTop} label="Top up" />;
  return <TopUpUsd id={id} choices={choices} quote={quote} />;
}

function TopUpUsd({ id, choices, quote }: { id: string; choices: PayChoice[]; quote: Quote }) {
  const [blocked, setBlocked] = useState(false);
  const [state, run, pending] = useSignedAction(doLockTop);
  return (
    <form action={run} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <PayWith choices={choices} mode="wallet" protocolOnTop quote={quote} stayOn={parseGroupKey(id).net} onBlocked={setBlocked} />
      <ErrorNote error={state?.error} />
      <Submit pending={pending} hold={blocked}>Top up</Submit>
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

export function WithdrawForm({ idleUsd, quote = chainQuote() }: { idleUsd: string; quote?: Quote }) {
  const [state, run, pending] = useSignedAction(withdrawUsd);
  return (
    <form action={run} className="space-y-3">
      <p className="text-sm text-muted-foreground">Idle in the vault: {priced(idleUsd, quote)}. USDC is the default. USDT and ETH are swapped after the withdrawal.</p>
      <ReceiveWith quote={quote} />
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
  quote = chainQuote(),
}: {
  id: string;
  fn: string;
  label: string;
  superWei: string;
  choices: PayChoice[];
  quote?: Quote;
}) {
  const [blocked, setBlocked] = useState(false);
  const [state, run, pending] = useSignedAction(doGroup);
  return (
    <form action={run} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="fn" value={fn} />
      <PayWith choices={choices} mode="wallet" fixedSuper={superWei} protocolOnTop quote={quote} stayOn={parseGroupKey(id).net} onBlocked={setBlocked} />
      <ErrorNote error={state?.error} />
      <Submit pending={pending} hold={blocked}>{label}</Submit>
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

