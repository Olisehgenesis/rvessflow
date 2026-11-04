"use client";

import { useActionState, useId } from "react";
import { saveDisplayName, skipDisplayName } from "@/lib/actions";

export function NameAsk() {
  const fieldId = useId();
  const [state, action, pending] = useActionState(saveDisplayName, null);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-4">
      <form action={action} className="relative w-full max-w-[27.5rem] rounded-[1.7rem] bg-white px-6 pt-6 pb-6 shadow-[0_28px_80px_-28px_rgba(0,0,0,0.55)]">
        <button
          type="submit"
          formAction={skipDisplayName}
          aria-label="Close"
          className="absolute top-4 right-4 grid size-9 place-items-center rounded-full text-lg text-[#5C6572] hover:bg-[#F4F5F1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
        >
          ×
        </button>
        <h2 className="pr-10 text-[1.65rem] leading-none font-semibold tracking-[-0.04em]">What should we call you?</h2>
        <p className="mt-2 text-sm text-[#6B7280]">You are signed in with your wallet. Add a name if this account does not have one yet. If someone already uses it, a number is added, so the next one is like Ada 3.</p>
        <label className="mt-6 block text-sm font-medium" htmlFor={fieldId}>
          Your name
        </label>
        <input
          id={fieldId}
          name="name"
          autoFocus
          autoComplete="nickname"
          maxLength={32}
          placeholder="Enter your name"
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? `${fieldId}-error` : undefined}
          className="mt-2 h-12 w-full rounded-xl border border-[#E4E2DC] bg-white px-3.5 text-[15px] outline-none placeholder:text-[#A3A8B0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
        />
        {state?.error ? (
          <p id={`${fieldId}-error`} className="mt-2 text-sm text-[#C5362B]">
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="mt-5 h-12 w-full rounded-full bg-[#171717] text-[15px] font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] active:scale-[0.99] disabled:opacity-60"
        >
          {pending ? "Saving" : "Continue"}
        </button>
        <button
          type="submit"
          formAction={skipDisplayName}
          className="mt-3 h-10 w-full text-sm font-medium text-[#5C6572] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
        >
          Not now
        </button>
      </form>
    </div>
  );
}
