"use client";

import { useState } from "react";
import { useSignedAction } from "@/components/sign-action";
import { VerifiedTick } from "@/components/verify-badge";
import { claimUbi } from "@/lib/actions";
import { openFaceCheck } from "@/lib/good-fv-sign";
import { money } from "@/lib/display";
import type { Address } from "viem";

const reasons = [
  { src: "/marks/paid.png", title: "A tick on your name", body: "Same idea as the check next to a name on X. Here it is clay, and it means a live unique person." },
  { src: "/marks/crypto.png", title: "Sponsored Celo gas", body: "After you verify, this passkey can send Celo calls without keeping CELO on hand, including the daily claim." },
  { src: "/marks/receive.png", title: "Daily free G$", body: "GoodDollar pays a Universal Basic Income once a day to each verified person." },
  { src: "/marks/group.png", title: "And more", body: "The same identity opens other GoodDollar commons later. One face. One claim." },
];

export function VerifyPanel({
  address,
  method,
  verified,
  claimable,
  expiresAt,
}: {
  address: Address;
  method: "passkey" | "wallet" | "tester";
  verified: boolean;
  claimable: string;
  expiresAt: number;
}) {
  const [state, run, pending] = useSignedAction(claimUbi);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const due = Number(claimable) > 0;
  const until = expiresAt > 0 ? new Date(expiresAt * 1000).toLocaleDateString() : "";

  async function verify() {
    setNote("");
    setBusy(true);
    try {
      await openFaceCheck({ address, method });
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Face verification did not start.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5">
      <div className="flex items-start gap-3">
        <VerifiedTick className="size-14 shrink-0" />
        <div className="min-w-0">
          <p className="text-base font-semibold">{verified ? "Verified" : "Verify"}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {verified
              ? until
                ? `GoodDollar knows this account is a unique person. The tick lasts until ${until}.`
                : "GoodDollar knows this account is a unique person."
              : "Why verify? Free sponsored Celo gas, a daily G$ claim, and a tick on this name. Face check is GoodDollar. This page stores no key."}
          </p>
        </div>
      </div>
      {!verified ? (
        <ul className="mt-4 space-y-3">
          {reasons.map((row) => (
            <li key={row.title} className="flex items-start gap-3">
              <img src={row.src} alt="" className="size-11 shrink-0 object-contain" />
              <span className="min-w-0 pt-1">
                <span className="block text-sm font-medium">{row.title}</span>
                <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">{row.body}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {verified ? (
        <form action={run} className="mt-4">
          {due ? (
            <p className="mb-3 text-sm">
              Today&apos;s UBI is <span className="font-semibold tabular-nums">{money(claimable)} G$</span>.
            </p>
          ) : (
            <p className="mb-3 text-sm text-muted-foreground">Today&apos;s G$ is already claimed. Come back tomorrow.</p>
          )}
          <button
            type="submit"
            disabled={pending || !due}
            className="inline-flex h-12 min-w-40 items-center justify-center rounded-full bg-[#141414] px-5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {pending ? "Claiming…" : due ? "Claim today's G$" : "Claimed today"}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => void verify()}
          disabled={busy}
          className="mt-5 inline-flex h-12 min-w-40 items-center justify-center rounded-full bg-[#D6F34A] px-5 text-sm font-semibold text-[#141414] disabled:opacity-40"
        >
          {busy ? "Opening…" : "Verify"}
        </button>
      )}
      {note || state?.error ? <p className="mt-3 text-sm text-destructive">{note || state?.error}</p> : null}
    </div>
  );
}
