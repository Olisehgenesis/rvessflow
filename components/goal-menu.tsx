"use client";

import { useState } from "react";
import { useActionState } from "react";
import { IconMore } from "@/components/icons";
import { ReleaseFunds } from "@/components/forms";
import { frequencies, type Frequency } from "@/lib/intent";
import { saveGoalDetails, type ActionState } from "@/lib/actions";
import { ErrorNote } from "@/components/ui-bits";

export function GoalMenu({
  id,
  description,
  frequency,
  saving,
}: {
  id: string;
  description: string;
  frequency: Frequency;
  saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-label="Goal actions" onClick={() => setOpen(true)} className="grid size-9 place-items-center">
        <IconMore className="size-5" />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Goal actions"
            className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-medium">Goal actions</p>
              <button type="button" aria-label="Close" className="grid size-9 place-items-center text-lg" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <NoteForm id={id} description={description} frequency={frequency} />
            {saving ? (
              <div className="mt-5">
                <p className="mb-2 text-sm font-medium">Move funds back to idle</p>
                <ReleaseFunds id={id} />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function NoteForm({ id, description, frequency }: { id: string; description: string; frequency: Frequency }) {
  const [state, action, pending] = useActionState(saveGoalDetails, null as ActionState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">About this goal</span>
        <textarea
          name="description"
          defaultValue={description}
          maxLength={280}
          rows={3}
          placeholder="Build a safety net for unexpected expenses. This goal helps you stay prepared."
          className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Frequency</span>
        <select name="frequency" defaultValue={frequency} className="h-12 w-full rounded-2xl border border-border bg-white px-4 text-sm">
          {frequencies.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <ErrorNote error={state?.error} />
      <button type="submit" disabled={pending} className="h-12 w-full rounded-full bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50">
        {pending ? "Saving…" : "Save details"}
      </button>
    </form>
  );
}
