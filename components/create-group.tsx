"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorNote } from "@/components/ui-bits";
import { createDraft, type ActionState } from "@/lib/actions";
import { cyclePlan, spanLabel, type CycleChoice } from "@/lib/cycle";
import { groupChainFacts, groupNetLabel, recommendedGroupNet, type GroupNet } from "@/lib/group-network";

const field = "h-12 rounded-2xl border-border bg-white px-4 text-base shadow-none";

export function CreateGroup({
  live,
  hints,
}: {
  live: Record<GroupNet, boolean>;
  hints: Record<GroupNet, string>;
}) {
  const [state, action, pending] = useActionState(createDraft, null as ActionState);
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [contribution, setContribution] = useState("");
  const [cycles, setCycles] = useState("4");
  const [choice, setChoice] = useState<CycleChoice>("week");
  const [days, setDays] = useState("14");
  const [network, setNetwork] = useState<GroupNet>(recommendedGroupNet);
  const [payout, setPayout] = useState(live[recommendedGroupNet] ? "plain" : "stream");
  function pickNetwork(next: GroupNet) {
    setNetwork(next);
    setPayout(live[next] ? "plain" : "stream");
  }
  const plan = cyclePlan(choice, Number(days));
  const total = Number(contribution) > 0 ? (Number(contribution) * Number(cycles)).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "";

  if (step === "review") {
    return (
      <form action={action} className="space-y-4">
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="description" value={description} />
        <input type="hidden" name="contribution" value={contribution} />
        <input type="hidden" name="cycles" value={cycles} />
        <input type="hidden" name="cycle" value={choice} />
        <input type="hidden" name="days" value={days} />
        <input type="hidden" name="payout" value={payout} />
        <input type="hidden" name="network" value={network} />
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-lg font-semibold">{name || "Untitled group"}</p>
          {description ? <p className="text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
          <dl className="space-y-2 text-sm">
            <Row label="Contribution" value={`${contribution || "0"} USD`} />
            <Row label="Each cycle" value={plan ? spanLabel(plan.cycle) : "Choose a cycle length"} />
            <Row label="Total cycles" value={cycles} />
            <Row label="You pay, across all cycles" value={total ? `${total} USD` : "—"} />
            <Row label="Chain" value={groupNetLabel(network)} />
            <Row label="Each turn" value={payout === "plain" ? "Paid as a transfer" : "Streams"} />
          </dl>
        </div>
        <p className="text-sm text-muted-foreground">You add people on the next screen. The group is written on-chain only when you start it.</p>
        <ErrorNote error={state?.error} />
        <Button type="submit" disabled={pending || !plan} className="h-12 w-full rounded-full text-base">
          {pending ? "Creating…" : "Create group"}
        </Button>
        <Button type="button" variant="outline" className="h-12 w-full rounded-full text-base" onClick={() => setStep("edit")}>
          Back
        </Button>
      </form>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim() || !plan || !(Number(contribution) > 0)) return;
        setStep("review");
      }}
    >
      <label className="block space-y-1.5">
        <Label htmlFor="name">Group name</Label>
        <Input id="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Friends savings" className={field} />
      </label>
      <label className="block space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Input id="description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What this group is for" className={field} />
      </label>
      <label className="block space-y-1.5">
        <Label htmlFor="contribution">Contribution amount</Label>
        <Input id="contribution" value={contribution} onChange={(event) => setContribution(event.target.value)} placeholder="100" inputMode="decimal" className={field} />
      </label>
      <label className="block space-y-1.5">
        <Label htmlFor="cycle">Cycle duration</Label>
        <select id="cycle" className={`${field} w-full`} value={choice} onChange={(event) => setChoice(event.target.value as CycleChoice)}>
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
          <Input id="days" inputMode="numeric" value={days} onChange={(event) => setDays(event.target.value)} className={field} />
        </label>
      ) : null}
      <label className="block space-y-1.5">
        <Label htmlFor="cycles">Total cycles</Label>
        <select id="cycles" className={`${field} w-full`} value={cycles} onChange={(event) => setCycles(event.target.value)}>
          <option value="4">4 cycles</option>
          <option value="8">8 cycles</option>
          <option value="12">12 cycles</option>
        </select>
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Chain</legend>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Same address on both. The group stays on the chain you pick.{" "}
          <Link href="/groups/chains" className="font-medium text-foreground underline">
            Base vs Celo
          </Link>
        </p>
        {(["celo", "base"] as const).map((net) => {
          const fact = groupChainFacts[net];
          const on = network === net;
          return (
            <label
              key={net}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl bg-card px-3 py-3 ${on ? "border-2 border-foreground" : "border border-border"}`}
            >
              <input type="radio" name="network-choice" className="mt-1 size-4" checked={on} onChange={() => pickNetwork(net)} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{fact.title}</span>
                  {fact.recommend ? <span className="rounded-full bg-[#E7F4C4] px-2 py-0.5 text-[11px] font-medium">Recommended</span> : null}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{fact.fee}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      <label className="block space-y-1.5">
        <Label htmlFor="payout">How each turn is paid</Label>
        <select id="payout" className={`${field} w-full`} value={payout} onChange={(event) => setPayout(event.target.value)}>
          <option value="plain">Paid each turn</option>
          <option value="stream">Streaming pot</option>
        </select>
        <span className="block text-xs leading-relaxed text-muted-foreground">{hints[network]}</span>
      </label>
      <Button type="submit" className="h-12 w-full rounded-full text-base">
        Continue
      </Button>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
