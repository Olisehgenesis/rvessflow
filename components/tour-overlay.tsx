"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { finishOnboarding, saveOnboardingStep, skipOnboarding } from "@/lib/actions";
import { tourSteps } from "@/lib/tour-steps";

function desktopNow() {
  return window.matchMedia("(min-width: 1024px)").matches;
}

function subscribeDesktop(onStoreChange: () => void) {
  const media = window.matchMedia("(min-width: 1024px)");
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

type Hole = { top: number; left: number; width: number; height: number };

function readHole(target?: string): Hole | null {
  if (!target) return null;
  const nodes = document.querySelectorAll(`[data-tour="${target}"]`);
  let node: HTMLElement | null = null;
  nodes.forEach((item) => {
    if (node || !(item instanceof HTMLElement)) return;
    const size = item.getBoundingClientRect();
    if (size.width >= 8 && size.height >= 8) node = item;
  });
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  const pad = 8;
  return {
    top: Math.max(8, rect.top - pad),
    left: Math.max(8, rect.left - pad),
    width: Math.min(window.innerWidth - 16, rect.width + pad * 2),
    height: rect.height + pad * 2,
  };
}

export function TourOverlay({ startStep }: { startStep: number }) {
  const desktop = useSyncExternalStore(subscribeDesktop, desktopNow, () => true);
  const steps = useMemo(() => tourSteps(desktop), [desktop]);
  const [index, setIndex] = useState(() => Math.min(Math.max(startStep, 0), Math.max(steps.length - 1, 0)));
  const [hole, setHole] = useState<Hole | null>(null);
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const step = steps[Math.min(index, steps.length - 1)];

  useEffect(() => {
    if (index > steps.length - 1) setIndex(Math.max(steps.length - 1, 0));
  }, [index, steps.length]);

  useEffect(() => {
    if (!step) return;
    if (step.target) {
      const node = Array.from(document.querySelectorAll(`[data-tour="${step.target}"]`)).find((item) => {
        if (!(item instanceof HTMLElement)) return false;
        const size = item.getBoundingClientRect();
        return size.width >= 8 && size.height >= 8;
      });
      if (node instanceof HTMLElement) node.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    const measure = () => setHole(readHole(step.target));
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  if (gone || !step || steps.length === 0) return null;
  const last = index >= steps.length - 1;
  const first = index <= 0;
  const cardTop = hole ? Math.min(window.innerHeight - 220, hole.top + hole.height + 12) : window.innerHeight / 2 - 90;
  const above = hole ? hole.top + hole.height > window.innerHeight - 240 : false;
  const placedTop = hole && above ? Math.max(16, hole.top - 188) : Math.max(16, cardTop);

  async function persist(next: number) {
    try {
      await saveOnboardingStep(next);
    } catch {
      // Progress still moves locally if the directory is down.
    }
  }

  async function go(next: number) {
    setIndex(next);
    await persist(next);
  }

  async function skip() {
    if (busy) return;
    setBusy(true);
    try {
      await skipOnboarding();
      setGone(true);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (busy) return;
    setBusy(true);
    try {
      await finishOnboarding();
      setGone(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-40" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {hole ? (
        <div
          className="pointer-events-none absolute rounded-[1.25rem] ring-2 ring-[#D6F34A]"
          style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height, boxShadow: "0 0 0 9999px rgba(20, 20, 20, 0.45)" }}
        />
      ) : (
        <div className="absolute inset-0 bg-[#141414]/45" />
      )}
      <div
        className="pointer-events-auto absolute left-1/2 z-10 w-[min(22.5rem,calc(100vw-2rem))] -translate-x-1/2 rounded-[1.6rem] border border-[#E6EADF] bg-white p-4 shadow-[0_24px_60px_-28px_rgba(20,20,20,0.45)]"
        style={{ top: placedTop }}
      >
        <p className="text-[11px] font-medium text-[#5C6572]">
          {index + 1} of {steps.length}
        </p>
        <h2 id="tour-title" className="mt-1 font-[family-name:var(--font-manrope)] text-lg font-semibold tracking-[-0.03em] text-[#141414]">
          {step.title}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-[#5C6572]">{step.body}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {first ? null : (
            <button type="button" className="h-11 rounded-full border border-[#E6EADF] px-4 text-sm font-semibold text-[#141414]" onClick={() => go(index - 1)} disabled={busy}>
              Back
            </button>
          )}
          {last ? (
            <button type="button" className="h-11 flex-1 rounded-full bg-[#D6F34A] px-4 text-sm font-semibold text-[#141414]" onClick={finish} disabled={busy}>
              Finish
            </button>
          ) : (
            <button type="button" className="h-11 flex-1 rounded-full bg-[#D6F34A] px-4 text-sm font-semibold text-[#141414]" onClick={() => go(index + 1)} disabled={busy}>
              Next
            </button>
          )}
        </div>
        {last ? null : (
          <button type="button" className="mt-2 h-10 w-full text-sm font-medium text-[#5C6572]" onClick={skip} disabled={busy}>
            Skip
          </button>
        )}
      </div>
    </div>
  );
}

export function TourHost({ eligible, step }: { eligible: boolean; step: number }) {
  if (!eligible) return null;
  return <TourOverlay startStep={step} />;
}
