"use client";

import { useState } from "react";
import { IconInfo } from "@/components/icons";

export function PenaltyHint({ rate }: { rate: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label="About the early unlock penalty"
        aria-expanded={open}
        className="grid size-5 place-items-center"
        onClick={() => setOpen((value) => !value)}
      >
        <IconInfo className="size-3.5" />
      </button>
      {open ? (
        <span className="absolute bottom-6 left-0 z-10 w-52 rounded-xl bg-foreground px-3 py-2 text-left text-xs leading-relaxed font-normal text-background">
          Leaving early costs {rate} of the principal. That amount goes to the bonus pool shared by locks that finish.
        </span>
      ) : null}
    </span>
  );
}
