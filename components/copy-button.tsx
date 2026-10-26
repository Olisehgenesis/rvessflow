"use client";

import { useState } from "react";
import { IconCheck, IconCopy } from "@/components/icons";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        });
      }}
      className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-sm font-medium text-foreground"
    >
      {copied ? <IconCheck className="size-4" /> : <IconCopy className="size-4" />}
      {copied ? "Copied" : label}
    </button>
  );
}
