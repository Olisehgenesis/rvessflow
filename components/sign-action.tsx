"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { continueIntent, type ActionState } from "@/lib/actions";
import { sendCalls } from "@/lib/client-sign";

function explain(error: unknown): string {
  const message = error instanceof Error ? error.message : "The transaction failed.";
  if (/reject|denied|dismiss/i.test(message)) return "The signature was dismissed.";
  if (/gas required exceeds allowance \(0\)|insufficient funds/i.test(message)) {
    return "This wallet has no ETH for the network fee. On this local app, that fee is paid on Base Sepolia.";
  }
  if (/transfer amount exceeds balance|insufficient balance/i.test(message)) {
    return "This account does not have enough for that amount. The swap and the stream are checked together.";
  }
  const line = message.split("\n").find((item) => item.trim()) ?? message;
  return line.replace(/^Error:\s*/, "").slice(0, 220);
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
    const sign = state?.sign;
    if (!sign) return;
    let cancel = false;
    const go = async () => {
      await Promise.resolve();
      if (cancel || sent.current === sign.nonce) return;
      sent.current = sign.nonce;
      setSigning(true);
      setLocalError(null);
      try {
        let current = sign;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          if (cancel) return;
          if (current.calls.length) await sendCalls(current);
          const next = await continueIntent(current.intent);
          if (next.error) throw new Error(next.error);
          if (next.href) {
            router.push(next.href);
            router.refresh();
            return;
          }
          if (!next.sign) {
            router.refresh();
            return;
          }
          current = next.sign;
        }
        throw new Error("That transaction did not finish.");
      } catch (error) {
        if (!cancel) setLocalError(explain(error));
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
