"use client";

import Link from "next/link";
import { useSignedAction } from "@/components/sign-action";
import { claimUbi } from "@/lib/actions";
import { money } from "@/lib/display";

export function HomeUbiClaim({
  verified,
  claimable,
}: {
  verified: boolean;
  claimable: string;
}) {
  const [state, run, pending] = useSignedAction(claimUbi, { art: "/tokens/gdx.png", title: "Claiming G$" });
  const due = verified && BigInt(claimable || "0") > 0n;

  if (!verified) {
    return (
      <section className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-[#E6EADF] bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#141414]">Daily G$</p>
          <p className="mt-0.5 text-xs leading-snug text-[#5C6572]">Verify once with GoodDollar to claim UBI here.</p>
        </div>
        <Link
          href="/settings/verify"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-[#D6F34A] px-4 text-sm font-semibold text-[#141414] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
        >
          Verify
        </Link>
      </section>
    );
  }

  if (!due) {
    return (
      <section className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-[#E6EADF] bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#141414]">Daily G$</p>
          <p className="mt-0.5 text-xs leading-snug text-[#5C6572]">Today&apos;s claim is done. Come back tomorrow.</p>
        </div>
        <Link href="/settings/verify" className="text-sm font-medium text-[#5C6572]">
          Details
        </Link>
      </section>
    );
  }

  return (
    <section className="mt-3 rounded-2xl border border-[#D7E7B0] bg-[#F4F9E8] px-4 py-3">
      <form action={run} className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#141414]">Daily G$</p>
          <p className="mt-0.5 text-xs leading-snug text-[#3C4A2E]">
            Claim <span className="font-semibold tabular-nums">{money(claimable)} G$</span> today
          </p>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-[#141414] px-4 text-sm font-semibold text-white disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
        >
          {pending ? "Claiming…" : "Claim"}
        </button>
      </form>
      {state?.error ? <p className="mt-2 text-xs text-destructive">{state.error}</p> : null}
    </section>
  );
}
