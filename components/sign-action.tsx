"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { continueIntent, type ActionState } from "@/lib/actions";
import { sendCalls } from "@/lib/client-sign";
import { setSignTrack } from "@/components/sign-progress";
import { bundlerLine, describeCalls, headline, leftoverSteps, withStatus, type SignStep } from "@/lib/sign-steps";
import type { Intent, SignPayload } from "@/lib/intent";

function explain(error: unknown): string {
  const message = error instanceof Error ? error.message : "The transaction failed.";
  if (/reject|denied|dismiss/i.test(message)) return "The signature was dismissed.";
  if (/gas required exceeds allowance \(0\)|insufficient funds/i.test(message)) {
    return "This wallet does not have enough of the native coin for the network fee.";
  }
  if (/transfer amount exceeds balance|insufficient balance/i.test(message)) {
    return "This account does not have enough for that amount. The swap and the stream are checked together.";
  }
  if (/0x4239717c/i.test(message)) {
    return "This account already has a vault. Wait a moment and create the flow again.";
  }
  if (/0x1dc930eb/i.test(message)) {
    return "The vault did not receive enough after the protocol fee to open the stream. Try again.";
  }
  if (/Invalid parameters were provided to the RPC method/i.test(message)) {
    const detail = message.split("\n").map((item) => item.trim()).find((item) => item && !/invalid parameters|double check/i.test(item));
    return detail ? detail.slice(0, 220) : "Celo rejected that gas request. Refresh and try again.";
  }
  const line = message.split("\n").find((item) => item.trim()) ?? message;
  return line.replace(/^Error:\s*/, "").slice(0, 220);
}

function origin() {
  return typeof window === "undefined" ? "" : window.location.origin;
}

function show(intent: Intent, steps: SignStep[], extra?: { error?: string; busy?: boolean }) {
  const copy = headline(intent);
  setSignTrack({
    open: true,
    title: extra?.error ? "This step did not finish" : copy.title,
    body: copy.body,
    steps,
    error: extra?.error,
    busy: extra?.busy ?? !extra?.error,
  });
}

function plan(done: SignStep[], current: SignPayload, phase: "sign" | "wait" | "fail"): SignStep[] {
  const seen = new Set(done.map((step) => step.id));
  const batch = describeCalls(current.calls).filter((row) => !seen.has(row.id));
  const bundler = bundlerLine(current.chainId, origin());
  const send = bundler && !seen.has("bundler") ? [bundler] : [];
  const rest = leftoverSteps(current.intent, new Set([...seen, ...batch.map((row) => row.id), ...send.map((row) => row.id)]));
  if (phase === "wait") {
    return [
      ...done,
      ...withStatus(send, "done"),
      ...withStatus(batch, "done"),
      ...withStatus(rest, rest[0]?.id === "confirm" ? "run" : "wait").map((step, index) =>
        index === 0 && step.id === "confirm" ? { ...step, status: "run" as const } : step,
      ),
    ];
  }
  if (phase === "fail") {
    const live = send.length ? send : batch.length ? batch : rest.slice(0, 1);
    const after = leftoverSteps(current.intent, new Set([...seen, ...live.map((row) => row.id)]));
    return [...done, ...withStatus(live, "fail"), ...withStatus(after, "wait")];
  }
  return [...done, ...withStatus(send, "run"), ...withStatus(batch, send.length ? "wait" : "run"), ...withStatus(rest, "wait")];
}

export function useSignedAction(
  action: (prev: ActionState, data: FormData) => Promise<ActionState>,
): [ActionState, (payload: FormData) => void, boolean] {
  const router = useRouter();
  const [state, run, pending] = useActionState(action, null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const sent = useRef("");

  useEffect(() => {
    if (signing) return;
    if (pending) {
      setSignTrack({
        open: true,
        title: "Getting the steps ready",
        body: "Checking the vault, the swap, and the stream on chain.",
        busy: true,
        steps: [{ id: "plan", title: "Build the transaction", detail: "Reading balances and Superfluid limits.", status: "run" }],
      });
      return;
    }
    if (state?.error && !state.sign) {
      setSignTrack({
        open: true,
        title: "This step did not finish",
        body: "The plan did not get as far as a signature.",
        busy: false,
        error: state.error,
        steps: [{ id: "plan", title: "Build the transaction", detail: state.error, status: "fail" }],
      });
    }
  }, [pending, signing, state]);

  useEffect(() => {
    const sign = state?.sign;
    if (!sign) return;
    let cancel = false;
    const go = async () => {
      await Promise.resolve();
      if (cancel || sent.current === sign.nonce) return;
      sent.current = sign.nonce;
      setSigning(true);
      setLocalError(null);
      const finished: SignStep[] = [];
      let current = sign;
      try {
        for (let attempt = 0; attempt < 8; attempt += 1) {
          if (cancel) return;
          show(current.intent, plan(finished, current, "sign"), { busy: true });
          if (current.calls.length) await sendCalls(current);
          for (const row of describeCalls(current.calls)) {
            if (!finished.some((item) => item.id === row.id)) finished.push({ ...row, status: "done" });
          }
          const bundler = bundlerLine(current.chainId, origin());
          if (bundler && !finished.some((item) => item.id === "bundler")) finished.push({ ...bundler, status: "done" });
          show(current.intent, plan(finished, current, "wait"), { busy: true });
          const next = await continueIntent(current.intent);
          if (next.error) throw new Error(next.error);
          if (next.href) {
            show(current.intent, [...finished, { id: "confirm", title: "Confirmed on chain", detail: "This batch landed.", status: "done" }], { busy: false });
            router.push(next.href);
            router.refresh();
            return;
          }
          if (!next.sign) {
            show(current.intent, [...finished, { id: "confirm", title: "Confirmed on chain", detail: "This batch landed.", status: "done" }], { busy: false });
            router.refresh();
            return;
          }
          current = next.sign;
        }
        throw new Error("That transaction did not finish.");
      } catch (error) {
        if (cancel) return;
        const message = explain(error);
        setLocalError(message);
        show(current.intent, plan(finished, current, "fail"), { error: message, busy: false });
      } finally {
        if (!cancel) setSigning(false);
      }
    };
    void go();
    return () => {
      cancel = true;
    };
  }, [state, router]);

  const error = localError || state?.error;
  const merged: ActionState = error ? { error } : null;
  return [merged, run, pending || signing];
}
