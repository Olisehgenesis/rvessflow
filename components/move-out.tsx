"use client";

import { useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useSignedAction } from "@/components/sign-action";
import { TokenIcon } from "@/components/token-icon";
import { networkLabel } from "@/lib/network";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorNote } from "@/components/ui-bits";
import { sendFunds } from "@/lib/actions";
import { portion, type MoveChoice } from "@/lib/send-math";

const steps = 1000;
const field = "h-12 rounded-2xl border-border bg-white px-4 text-base shadow-none";

function plain(amount: bigint, decimals: number): string {
  const raw = formatUnits(amount, decimals);
  if (!raw.includes(".")) return raw;
  return raw.replace(/0+$/, "").replace(/\.$/, "");
}

function typedWei(value: string, decimals: number, maxWei: bigint): bigint {
  const clean = value.replace(/,/g, "").trim();
  if (!/^\d+(\.\d*)?$/.test(clean)) return 0n;
  try {
    const parsed = parseUnits(clean, decimals);
    return parsed > maxWei ? maxWei : parsed;
  } catch {
    return 0n;
  }
}

export function MoveOut({ choices }: { choices: MoveChoice[] }) {
  const [asset, setAsset] = useState(choices[0]?.asset ?? "eth");
  const [step, setStep] = useState(0);
  const [typed, setTyped] = useState("");
  const [editing, setEditing] = useState(false);
  const [to, setTo] = useState("");
  const [state, send, pending] = useSignedAction(sendFunds);
  const picked = choices.find((choice) => choice.asset === asset) ?? choices[0];
  const maxWei = BigInt(picked?.maxWei ?? "0");
  const decimals = picked?.decimals ?? 18;
  const amountWei = editing ? typedWei(typed, decimals, maxWei) : portion(maxWei, step, steps);
  const amount = plain(amountWei, decimals);
  const slider = maxWei > 0n ? Math.min(steps, Math.round(Number((amountWei * BigInt(steps)) / maxWei))) : 0;

  if (!picked) {
    return <p className="text-sm leading-relaxed text-muted-foreground">This account has no ETH or USDC to send. Money inside a saving stays there until that saving is withdrawn.</p>;
  }

  return (
    <form action={send} className="space-y-4">
      <input type="hidden" name="asset" value={picked.asset} />
      <input type="hidden" name="amount" value={amountWei > 0n ? amount : ""} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Token</legend>
        {choices.map((choice) => {
          const on = choice.asset === picked.asset;
          return (
            <button
              key={choice.asset}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setAsset(choice.asset);
                setStep(0);
                setTyped("");
                setEditing(false);
              }}
              className={`flex w-full items-center gap-3 rounded-2xl bg-card px-3 py-3 text-left ${on ? "border-2 border-foreground" : "border border-border"}`}
            >
              <TokenIcon symbol={choice.label} network={networkLabel()} className="size-10" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{choice.label}</span>
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {choice.balance} {choice.label} in this account
                </span>
              </span>
            </button>
          );
        })}
      </fieldset>

      <label className="block space-y-1.5">
        <Label htmlFor="to">Wallet address</Label>
        <Input id="to" name="to" value={to} onChange={(event) => setTo(event.target.value)} autoComplete="off" spellCheck={false} placeholder="0x…" className={field} />
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="amount">Amount</Label>
          <span className="text-sm font-semibold tabular-nums">{maxWei > 0n ? `${Math.round((slider / steps) * 100)}%` : "0%"}</span>
        </div>
        <input
          type="range"
          min={0}
          max={steps}
          step={1}
          value={slider}
          disabled={maxWei <= 0n}
          aria-valuemin={0}
          aria-valuemax={steps}
          aria-valuenow={slider}
          aria-label={`Amount of ${picked.label}, up to the maximum`}
          onChange={(event) => {
            setEditing(false);
            setStep(Number(event.target.value));
          }}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#E7EDE0] accent-[#141414] disabled:cursor-not-allowed disabled:opacity-40"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0</span>
          <span>Max {picked.max} {picked.label}</span>
        </div>
        <Input
          id="amount"
          inputMode="decimal"
          value={editing ? typed : amountWei > 0n ? amount : ""}
          placeholder="0"
          className={field}
          onChange={(event) => {
            setEditing(true);
            setTyped(event.target.value);
          }}
        />
        {picked.note ? <p className="text-xs leading-relaxed text-muted-foreground">{picked.note}</p> : null}
      </div>

      <ErrorNote error={state?.error} />
      <Button type="submit" disabled={pending || amountWei <= 0n || to.trim().length === 0} className="h-12 w-full rounded-full text-base">
        {pending ? "Sending…" : "Send"}
      </Button>
    </form>
  );
}
