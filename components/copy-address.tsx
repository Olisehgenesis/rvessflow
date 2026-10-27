"use client";

import { useState } from "react";

export function CopyAddress({ address }: { address: string }) {
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
