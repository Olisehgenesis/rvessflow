"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorNote } from "@/components/ui-bits";
import { ChainTiles, CycleCount, DurationChips, PayoutTiles, TokenChips, field } from "@/components/group-terms";
import { createDraft, type ActionState } from "@/lib/actions";
import { cyclePlan, spanLabel, type CycleChoice } from "@/lib/cycle";
import { draftAmount, type GroupTokenKind } from "@/lib/group-token";
import { groupNetLabel, recommendedGroupNet, type GroupNet } from "@/lib/group-network";

export function CreateGroup({ live }: { live: Record<GroupNet, boolean> }) {
  const [state, action, pending] = useActionState(createDraft, null as ActionState);
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [contribution, setContribution] = useState("");
  const [cycles, setCycles] = useState("2");
  const [choice, setChoice] = useState<CycleChoice>("week");
  const [days, setDays] = useState("14");
  const [network, setNetwork] = useState<GroupNet>(recommendedGroupNet);
  const [token, setToken] = useState<GroupTokenKind>("usd");
  const [payout, setPayout] = useState(live[recommendedGroupNet] ? "plain" : "stream");
  function pickNetwork(next: GroupNet) {
    setNetwork(next);
    if (next !== "celo") setToken("usd");
    setPayout(live[next] ? payout : "stream");
  }
  function pickToken(next: GroupTokenKind) {
    setToken(next);
    if (next === "gdx") {
      setNetwork("celo");
      if (!live.celo) setPayout("stream");
    }
  }
  const plan = cyclePlan(choice, Number(days));
  const unit = draftAmount(contribution || "0", token);
  const total = Number(contribution) > 0 ? (Number(contribution) * Number(cycles || 0)).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "";

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
        <input type="hidden" name="token" value={token} />
        <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
          <p className="text-lg font-semibold sm:col-span-2">{name || "Untitled group"}</p>
          {description ? <p className="text-sm leading-relaxed text-muted-foreground sm:col-span-2">{description}</p> : null}
          <Row label="Each turn" value={unit} />
          <Row label="Money" value={token === "gdx" ? "G$ on Celo" : `USD on ${groupNetLabel(network)}`} />
          <Row label="How often" value={plan ? spanLabel(plan.cycle) : "Choose a cycle length"} />
          <Row label="Turns" value={cycles} />
          <Row label="You pay, all turns" value={total ? `${total} ${token === "gdx" ? "G$" : "USD"}` : "—"} />
          <Row label="Paid as" value={payout === "plain" ? "Transfer each turn" : "Stream"} />
        </div>
        <p className="text-sm text-muted-foreground">
          You add people on the next screen. When they are in, you start the group. Each of you posts {total ? `${total} ${token === "gdx" ? "G$" : "USD"}` : "your contribution for every turn"} before the rotation pays.
        </p>
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
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim() || !plan || !(Number(contribution) > 0) || !Number(cycles)) return;
        setStep("review");
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <Label htmlFor="name">Group name</Label>
          <Input id="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ours" className={field} />
        </label>
        <label className="block space-y-1.5">
          <Label htmlFor="description">What it is for</Label>
          <Input id="description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Weekly turn" className={field} />
        </label>
        <label className="block space-y-1.5">
          <Label htmlFor="contribution">Each person pays</Label>
          <Input id="contribution" value={contribution} onChange={(event) => setContribution(event.target.value)} placeholder="20" inputMode="decimal" className={field} />
        </label>
        <div className="space-y-1.5">
          <Label>Money</Label>
          <TokenChips network={network} token={token} onToken={pickToken} />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {token === "gdx" ? "Good Dollar on Celo. Amounts are in G$." : network === "celo" ? "Dollar token on Celo (cUSDx)." : "Dollar token on Base (USDCx)."}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>How often</Label>
          <DurationChips choice={choice} onChoice={setChoice} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cycles">How many turns</Label>
          <CycleCount value={cycles} onChange={setCycles} />
        </div>
        {choice === "custom" ? (
          <label className="block space-y-1.5 sm:col-span-2">
            <Label htmlFor="days">Days each turn</Label>
            <Input id="days" inputMode="numeric" value={days} onChange={(event) => setDays(event.target.value)} className={field} />
          </label>
        ) : null}
        <div className="space-y-1.5">
          <Label>Chain</Label>
          <ChainTiles network={network} onNetwork={pickNetwork} />
        </div>
        <div className="space-y-1.5">
          <Label>How it pays</Label>
          <PayoutTiles payout={payout} onPayout={setPayout} live={live[network]} />
        </div>
      </div>
      <Button type="submit" className="h-12 w-full rounded-full text-base">
        Continue
      </Button>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
