"use client";

import { useEffect, useState } from "react";

export function ReceiveWhen({ at }: { at: number }) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!at) return;
    setText(new Date(at * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }));
  }, [at]);
  return <time dateTime={at ? new Date(at * 1000).toISOString() : undefined}>{text || "…"}</time>;
}
