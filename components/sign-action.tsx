"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { continueIntent, type ActionState } from "@/lib/actions";
import { sendCalls } from "@/lib/client-sign";
import { setSignTrack } from "@/components/sign-progress";
import { describeCalls, humanArt, humanTrack, phaseTitle, type HumanPhase, type SignStep } from "@/lib/sign-steps";
import type { Intent } from "@/lib/intent";

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
  if (/perUserMaximumSpend|Celo gas sponsorship for this passkey/i.test(message)) {
    return "Celo gas sponsorship for this passkey is used up. Send a little CELO to this passkey address, then try again.";
  }
  if (/AA21|didn't pay prefund/i.test(message)) {
    return "This passkey has no CELO for the network fee, and Celo gas sponsorship did not attach. Send a little CELO here, then try again.";
  }
  if (/Invalid parameters were provided to the RPC method/i.test(message)) {
    return "That didn't go through. Refresh and try again.";
  }
  if (/0xfa3505cf|UserOperation reverted during simulation/i.test(message)) {
    return "This didn't go through. Try again.";
  }
  if (/0x[0-9a-f]{8}/i.test(message) || /https?:\/\//i.test(message)) {
    return "This didn't go through. Try again.";
  }
  const line = message.split("\n").find((item) => item.trim()) ?? message;
  return line.replace(/^Error:\s*/, "").slice(0, 120);
}

function show(intent: Intent, phase: HumanPhase, extra?: { error?: string; busy?: boolean }) {
  const failed = Boolean(extra?.error);
  setSignTrack({
    open: true,
    title: phaseTitle(intent, phase, failed),
    body: extra?.error ?? "",
    art: humanArt(intent),
    steps: humanTrack(phase, failed),
    error: extra?.error,
    busy: extra?.busy ?? !failed,
  });
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
        title: "Creating",
        body: "",
        art: "/marks/saving.png",
        busy: true,
        steps: humanTrack("create"),
      });
      return;
    }
    if (state?.error && !state.sign) {
      setSignTrack({
        open: true,
        title: "Didn't go through",
        body: "",
        art: "/marks/saving.png",
        busy: false,
        error: state.error,
        steps: humanTrack("create", true),
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
          show(current.intent, "sign", { busy: true });
          if (current.calls.length) await sendCalls(current);
          for (const row of describeCalls(current.calls)) {
            if (!finished.some((item) => item.id === row.id)) finished.push({ ...row, status: "done" });
          }
          show(current.intent, "send", { busy: true });
          const next = await continueIntent(current.intent);
          if (next.error) throw new Error(next.error);
          if (next.href) {
            show(current.intent, "done", { busy: false });
            router.push(next.href);
            router.refresh();
            return;
          }
          if (!next.sign) {
            show(current.intent, "done", { busy: false });
            router.refresh();
            return;
          }
          current = next.sign;
        }
        throw new Error("That didn't finish.");
      } catch (error) {
        if (cancel) return;
        const message = explain(error);
        setLocalError(message);
        show(current.intent, finished.length ? "send" : "sign", { error: message, busy: false });
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
