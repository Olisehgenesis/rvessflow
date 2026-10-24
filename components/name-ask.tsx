"use client";

import { useId, useState } from "react";
import { saveDisplayName } from "@/lib/actions";

export function NameAsk() {
  const fieldId = useId();
  const [error, setError] = useState("");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-4">
      <form
        className="w-full max-w-[27.5rem] rounded-[1.7rem] bg-white px-6 pt-6 pb-6 shadow-[0_28px_80px_-28px_rgba(0,0,0,0.55)]"
        action={async (formData) => {
          const next = String(formData.get("name") ?? "").trim();
          if (!next) {
            setError("Enter a name to continue.");
            return;
          }
          await saveDisplayName(formData);
        }}
      >
        <h2 className="text-[1.65rem] leading-none font-semibold tracking-[-0.04em]">What should we call you?</h2>
        <p className="mt-2 text-sm text-[#6B7280]">You're signed in with your wallet. Add a name if this account doesn't have one yet.</p>
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
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          className="mt-2 h-12 w-full rounded-xl border border-[#E4E2DC] bg-white px-3.5 text-[15px] outline-none placeholder:text-[#A3A8B0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
        />
        {error ? (
          <p id={`${fieldId}-error`} className="mt-2 text-sm text-[#C5362B]">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          className="mt-5 h-12 w-full rounded-full bg-[#171717] text-[15px] font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] active:scale-[0.99]"
        >
          Continue
        </button>
      </form>
    </div>
  );
}
