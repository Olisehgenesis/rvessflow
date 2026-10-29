"use client";

import { useSyncExternalStore } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SignStep } from "@/lib/sign-steps";

export type SignTrack = {
  open: boolean;
  title: string;
  body: string;
  art?: string;
  steps: SignStep[];
  error?: string;
  busy: boolean;
};

let track: SignTrack | null = null;
const listeners = new Set<() => void>();

export function setSignTrack(next: SignTrack | null) {
  track = next;
  for (const listen of listeners) listen();
}

function subscribe(listen: () => void) {
  listeners.add(listen);
  return () => listeners.delete(listen);
}

function snapshot() {
  return track;
}

function Rail({ steps }: { steps: SignStep[] }) {
  const total = Math.max(steps.length, 1);
  const done = steps.filter((step) => step.status === "done").length;
  const run = steps.findIndex((step) => step.status === "run" || step.status === "fail");
  const fill = run >= 0 ? (run + 0.55) / total : done / total;
  return (
    <ol className="relative grid grid-cols-4 gap-1" aria-label="Progress">
      <span className="absolute top-[9px] right-4 left-4 h-0.5 rounded-full bg-[#E6EADF]" aria-hidden />
      <span
        className="absolute top-[9px] left-4 h-0.5 rounded-full bg-[#141414] transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
        style={{ width: `calc(${Math.max(0, fill * 100)}% - 2rem)` }}
        aria-hidden
      />
      {steps.map((step) => {
        const on = step.status === "done" || step.status === "run" || step.status === "fail";
        const live = step.status === "run";
        const fail = step.status === "fail";
        return (
          <li key={step.id} className="relative z-[1] flex flex-col items-center gap-1.5">
            <span
              className={`size-2.5 rounded-full ${fail ? "bg-[#E24B4A]" : on ? "bg-[#141414]" : "bg-[#D7DCD0]"} ${live ? "motion-safe:animate-pulse" : ""}`}
            />
            <span className={`text-[11px] font-medium ${on ? "text-[#141414]" : "text-[#8B919A]"}`}>{step.title}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function SignProgressHost() {
  const state = useSyncExternalStore(subscribe, snapshot, () => null);
  if (!state?.open) return null;
  const failed = Boolean(state.steps.find((step) => step.status === "fail") || state.error);
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !state.busy) setSignTrack(null); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-[#141414]/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-[61] w-[min(100%-1.5rem,22rem)] -translate-x-1/2 -translate-y-1/2 rounded-[1.5rem] bg-white px-5 pt-4 pb-5 shadow-[0_28px_80px_-28px_rgba(0,0,0,0.55)] outline-none">
          <div className="flex justify-end">
            <Dialog.Close disabled={state.busy} className="grid size-8 place-items-center rounded-full text-[#141414] hover:bg-black/5 disabled:opacity-30">
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </Dialog.Close>
          </div>
          <div className="flex flex-col items-center text-center">
            {state.art ? (
              <img src={state.art} alt="" className="size-20 object-contain" />
            ) : (
              <span className={`grid size-12 place-items-center rounded-full text-white ${failed ? "bg-[#E24B4A]" : "bg-[#141414]"}`}>
                {failed ? <X className="size-5" /> : <span className="size-5 animate-pulse rounded-full bg-white/90" />}
              </span>
            )}
            <Dialog.Title className="mt-3 text-lg font-semibold tracking-[-0.03em]">{state.title}</Dialog.Title>
            <Dialog.Description className="sr-only">{state.body || state.title}</Dialog.Description>
          </div>
          <div className="mt-5">
            <Rail steps={state.steps} />
          </div>
          {failed ? (
            <Button type="button" className="mt-5 h-11 w-full rounded-full text-sm" onClick={() => setSignTrack(null)}>
              Try again
            </Button>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
