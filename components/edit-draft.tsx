"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorNote } from "@/components/ui-bits";
import { saveDraft, saveGroupName } from "@/lib/actions";

const field = "h-12 rounded-2xl border-border bg-white px-4 text-base shadow-none";

export function EditDraftForm({
  draft,
}: {
  draft: { id: string; name: string; description: string; contribution: string; cycle: string; days: string; cycles: number; plain: boolean };
}) {
  const [state, action, pending] = useActionState(saveDraft, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={draft.id} />
      <label className="block space-y-1.5">
        <Label htmlFor="name">Group name</Label>
        <Input id="name" name="name" defaultValue={draft.name} className={field} />
      </label>
      <label className="block space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Input id="description" name="description" defaultValue={draft.description} className={field} />
      </label>
      <label className="block space-y-1.5">
        <Label htmlFor="contribution">Contribution amount</Label>
        <Input id="contribution" name="contribution" defaultValue={draft.contribution} inputMode="decimal" className={field} />
      </label>
      <label className="block space-y-1.5">
        <Label htmlFor="cycle">Cycle duration</Label>
        <select id="cycle" name="cycle" defaultValue={draft.cycle} className={`${field} w-full`}>
          <option value="hour">Hour</option>
          <option value="week">Week</option>
          <option value="month">Month, 30 days</option>
          <option value="year">Year, 365 days</option>
          <option value="custom">Custom days</option>
        </select>
      </label>
      <label className="block space-y-1.5">
        <Label htmlFor="days">Days, if custom</Label>
        <Input id="days" name="days" defaultValue={draft.days} inputMode="numeric" className={field} />
      </label>
      <label className="block space-y-1.5">
        <Label htmlFor="cycles">Total cycles</Label>
        <select id="cycles" name="cycles" defaultValue={String(draft.cycles)} className={`${field} w-full`}>
          <option value="4">4 cycles</option>
          <option value="8">8 cycles</option>
          <option value="12">12 cycles</option>
        </select>
      </label>
      <label className="block space-y-1.5">
        <Label htmlFor="payout">How each turn is paid</Label>
        <select id="payout" name="payout" defaultValue={draft.plain ? "plain" : "stream"} className={`${field} w-full`}>
          <option value="stream">Streaming pot</option>
          <option value="plain">Paid each turn</option>
        </select>
      </label>
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
