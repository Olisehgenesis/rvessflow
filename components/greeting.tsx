"use client";

import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

function hourNow() {
  return new Date().getHours();
}

function hourOnServer() {
  return -1;
}

/** Time-of-day line under the header. The server renders nothing so the clock is not baked into prerender. */
export function Greeting({ name }: { name: string }) {
  const hour = useSyncExternalStore(subscribe, hourNow, hourOnServer);
  if (hour < 0) return null;
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const trimmed = name.trim();
  const named = trimmed !== "" && trimmed.toLowerCase() !== "wallet";
  return <p className="mb-4 text-sm text-muted-foreground">{named ? `Good ${part}, ${trimmed}` : `Good ${part}`}</p>;
}
