"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorNote } from "@/components/ui-bits";
import { ChainTiles, CycleCount, DurationChips, PayoutTiles, TokenChips, field } from "@/components/group-terms";
import { saveDraft, saveGroupName } from "@/lib/actions";
import type { CycleChoice } from "@/lib/cycle";
import type { GroupTokenKind } from "@/lib/group-token";
import type { GroupNet } from "@/lib/group-network";

export function EditDraftForm({
  draft,
  live,
}: {
  draft: {
    id: string;
    name: string;
    description: string;
    contribution: string;
    cycle: string;
    days: string;
    cycles: number;
    plain: boolean;
    network: GroupNet;
    token: GroupTokenKind;
  };
  live: boolean;
}) {
  const [state, action, pending] = useActionState(saveDraft, null);
  const [choice, setChoice] = useState<CycleChoice>((draft.cycle as CycleChoice) || "week");
  const [cycles, setCycles] = useState(String(draft.cycles));
  const [network, setNetwork] = useState<GroupNet>(draft.network);
  const [token, setToken] = useState<GroupTokenKind>(draft.token);
  const [payout, setPayout] = useState(draft.plain ? "plain" : "stream");
  function pickNetwork(next: GroupNet) {
    setNetwork(next);
    if (next !== "celo") setToken("usd");
    if (!live) setPayout("stream");
  }
  function pickToken(next: GroupTokenKind) {
    setToken(next);
    if (next === "gdx") setNetwork("celo");
  }
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="id" value={draft.id} />
      <input type="hidden" name="cycle" value={choice} />
      <input type="hidden" name="cycles" value={cycles} />
      <input type="hidden" name="network" value={network} />
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="payout" value={payout} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <Label htmlFor="name">Group name</Label>
          <Input id="name" name="name" defaultValue={draft.name} className={field} />
        </label>
        <label className="block space-y-1.5">
          <Label htmlFor="description">What it is for</Label>
          <Input id="description" name="description" defaultValue={draft.description} className={field} />
        </label>
        <label className="block space-y-1.5">
          <Label htmlFor="contribution">Each person pays</Label>
          <Input id="contribution" name="contribution" defaultValue={draft.contribution} inputMode="decimal" className={field} />
        </label>
        <div className="space-y-1.5">
          <Label>Money</Label>
          <TokenChips network={network} token={token} onToken={pickToken} />
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
            <Input id="days" name="days" defaultValue={draft.days} inputMode="numeric" className={field} />
          </label>
        ) : (
          <input type="hidden" name="days" value={draft.days} />
        )}
        <div className="space-y-1.5">
          <Label>Chain</Label>
          <ChainTiles network={network} onNetwork={pickNetwork} />
        </div>
        <div className="space-y-1.5">
          <Label>How it pays</Label>
          <PayoutTiles payout={payout} onPayout={setPayout} live={live} />
        </div>
      </div>
      <ErrorNote error={state?.error} />
      <Button type="submit" disabled={pending} className="h-12 w-full rounded-full text-base">
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}

export function EditLiveForm({ id, name, description }: { id: string; name: string; description: string }) {
  const [state, action, pending] = useActionState(saveGroupName, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <label className="block space-y-1.5">
        <Label htmlFor="name">Group name</Label>
        <Input id="name" name="name" defaultValue={name} className={field} />
      </label>
      <label className="block space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Input id="description" name="description" defaultValue={description} className={field} />
      </label>
      <p className="text-sm leading-relaxed text-muted-foreground">The contribution, cycle length, and number of cycles are fixed once the group is on-chain.</p>
      <ErrorNote error={state?.error} />
      <Button type="submit" disabled={pending} className="h-12 w-full rounded-full text-base">
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
