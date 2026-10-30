"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyAddress({ address, compact = false }: { address: string; compact?: boolean }) {
  const [copied, setCopied] = useState<"idle" | "copied" | "blocked">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied("copied");
    } catch {
      setCopied("blocked");
    }
  }

  const label = copied === "copied" ? "Address copied" : copied === "blocked" ? "Copy blocked by the browser" : "Copy address";

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={label}
        className="-mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[#5C6572] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
      >
        {copied === "copied" ? <Check className="size-4" strokeWidth={2} /> : <Copy className="size-4" strokeWidth={1.75} />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground underline decoration-border underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
    >
      {label}
    </button>
  );
}
