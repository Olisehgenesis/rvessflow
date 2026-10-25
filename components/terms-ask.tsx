"use client";

import { acceptTerms } from "@/lib/actions";
import { terms } from "@/lib/terms";

export function TermsAsk() {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-[#141414]/40 p-4">
      <form action={acceptTerms} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <h2 className="text-[1.45rem] leading-none font-semibold tracking-[-0.04em]">Before you sign</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">Read these, then agree. The next signature is yours.</p>
        <ul className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
          {terms.map((item) => (
            <li key={item.title}>
              <p className="text-sm font-semibold">{item.title}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-[#5C6572]">{item.body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13px] text-[#6B7280]">
          The full page is at <a className="font-medium text-[#141414] underline" href="/terms">the terms</a>.
        </p>
        <button
          type="submit"
          className="mt-4 h-12 w-full rounded-full bg-[#171717] text-[15px] font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] active:scale-[0.99]"
        >
          I agree
        </button>
      </form>
    </div>
  );
}
