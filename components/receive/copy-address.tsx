"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { truncateAddress } from "@/lib/receive-link";

export function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const short = useMemo(() => truncateAddress(address), [address]);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,#202020_6%,white)] px-2.5 py-1 font-mono text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(address);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard may be blocked.
        }
      }}
    >
      {short}
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}
