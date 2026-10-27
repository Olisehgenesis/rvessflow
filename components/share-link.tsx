"use client";

import { useState } from "react";

export function ShareLink({ url }: { url: string }) {
  const [note, setNote] = useState("Share link");
  return (
    <button
      type="button"
      onClick={() => {
        if (navigator.share) {
          void navigator.share({ url }).catch(() => undefined);
          return;
        }
        void navigator.clipboard.writeText(url).then(() => {
          setNote("Link copied");
          window.setTimeout(() => setNote("Share link"), 1600);
        });
      }}
      className="inline-flex h-12 items-center justify-center rounded-full border border-border px-4 text-sm font-medium"
    >
      {note}
    </button>
  );
}
