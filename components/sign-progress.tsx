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

const colors = ["#D8E6F2", "#77C79B", "#F39C41", "#F16364", "#6D68AD"];

function Rail({ steps }: { steps: SignStep[] }) {
  const total = Math.max(steps.length, 1);
  const done = steps.filter((step) => step.status === "done").length;
  const run = steps.findIndex((step) => step.status === "run" || step.status === "fail");
  const at = run >= 0 ? (run + 0.5) / total : done / total;
  const x = 20 + at * 460;
  return (
    <svg viewBox="0 0 500 56" className="h-12 w-full" aria-hidden>
      {steps.map((step, index) => {
        const start = (500 / total) * index;
        const width = 500 / total;
        const fill = step.status === "fail" ? "#F16364" : step.status === "done" ? "#77C79B" : step.status === "run" ? colors[Math.min(index, colors.length - 1)] : "#E8EEF4";
        return <rect key={step.id} x={start} y={22} width={width} height={12} fill={fill} />;
      })}
      <circle cx={x} cy={28} r={14} fill="#6E68AC" />
    </svg>
  );
}

function Mark({ step, index }: { step: SignStep; index: number }) {
  if (step.status === "done") {
    return (
      <span className="grid size-7 place-items-center rounded-full bg-[#1F8A4C] text-white">
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
        </svg>
      </span>
    );
  }
  if (step.status === "fail") {
    return (
      <span className="grid size-7 place-items-center rounded-full bg-[#E24B4A] text-white">
        <X className="size-3.5" />
      </span>
    );
  }
  if (step.status === "run") {
    return <span className="grid size-7 place-items-center rounded-full bg-[#6E68AC] text-xs font-semibold text-white">{index + 1}</span>;
  }
  return <span className="grid size-7 place-items-center rounded-full border border-border bg-white text-xs font-medium text-muted-foreground">{index + 1}</span>;
}

export function SignProgressHost() {
  const state = useSyncExternalStore(subscribe, snapshot, () => null);
  if (!state?.open) return null;
  const failed = state.steps.find((step) => step.status === "fail");
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !state.busy) setSignTrack(null); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-[#141414]/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-[61] max-h-[min(92dvh,820px)] w-[min(100%-1.25rem,26rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[1.5rem] bg-white px-5 pt-4 pb-5 shadow-[0_28px_80px_-28px_rgba(0,0,0,0.55)] outline-none">
          <div className="flex justify-end">
            <Dialog.Close disabled={state.busy} className="grid size-8 place-items-center rounded-full text-[#141414] hover:bg-black/5 disabled:opacity-30">
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </Dialog.Close>
          </div>
          <div className="flex flex-col items-center text-center">
            <span className={`grid size-12 place-items-center rounded-full text-white ${failed ? "bg-[#E24B4A]" : state.busy ? "bg-[#6E68AC]" : "bg-[#1F8A4C]"}`}>
              {failed ? <X className="size-6" /> : state.busy ? (
                <span className="size-5 animate-pulse rounded-full bg-white/90" />
              ) : (
                <svg viewBox="0 0 16 16" className="size-6" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                </svg>
              )}
            </span>
            <Dialog.Title className="mt-4 text-lg font-semibold tracking-[-0.03em]">
              {failed ? "This step did not finish" : state.title}
            </Dialog.Title>
            <Dialog.Description className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{state.body}</Dialog.Description>
          </div>
          <div className="mt-4">
            <Rail steps={state.steps} />
          </div>
          <ol className="mt-2">
            {state.steps.map((step, index) => {
              const current = step.status === "run" || step.status === "fail";
              const line = index < state.steps.length - 1;
              return (
                <li key={step.id} className="grid grid-cols-[1.75rem_1fr] gap-x-3">
                  <div className="flex flex-col items-center">
                    <Mark step={step} index={index} />
                    {line ? <span className={`w-0.5 flex-1 ${step.status === "done" ? "bg-[#1F8A4C]" : "bg-border"}`} /> : null}
                  </div>
                  <div className={`mb-2 rounded-xl px-3 py-2 ${current ? "bg-muted" : ""}`}>
                    <p className="text-sm font-medium">{step.title}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
                    {step.status === "fail" && state.error ? <p className="mt-1 text-xs leading-relaxed text-destructive">{state.error}</p> : null}
                  </div>
                </li>
              );
            })}
          </ol>
          {failed ? (
            <Button type="button" className="mt-2 h-11 w-full rounded-full text-sm" onClick={() => setSignTrack(null)}>
              Ok, I see it
            </Button>
          ) : (
            <p className="mt-2 text-center text-xs text-muted-foreground">{state.busy ? "Keep this screen open." : "Done."}</p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
