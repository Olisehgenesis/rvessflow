"use client";

import { useEffect, useState } from "react";

const items = [
  ["reminders", "Contribution reminders", "A reminder before a payment window closes."],
  ["joins", "New member joins", "When someone is added to this group."],
  ["cycles", "Cycle completed", "When a cycle finishes."],
  ["activity", "General activity", "Payments, misses, and changes to the order."],
] as const;

export function GroupNotes({ id }: { id: string }) {
  const key = `rvess-group-notes:${id}`;
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        setPrefs(JSON.parse(raw) as Record<string, boolean>);
      } catch {
        setPrefs({});
      }
    }
    setReady(true);
  }, [key]);

  function toggle(name: string) {
    const next = { ...prefs, [name]: !prefs[name] };
    setPrefs(next);
    localStorage.setItem(key, JSON.stringify(next));
  }

  return (
    <div className="space-y-4">
      <div className="mb-4 flex items-center gap-3">
        <img src="/marks/bell.png" alt="" className="size-12 shrink-0 object-contain" />
        <p className="text-sm leading-snug text-muted-foreground">These switches are saved on this phone. RvessFlow does not send alerts yet.</p>
      </div>
      <ul className="divide-y divide-border border-y border-border">
        {items.map(([name, title, body]) => (
          <li key={name} className="flex items-center justify-between gap-4 py-3">
            <span>
              <span className="block text-sm font-medium">{title}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{body}</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(prefs[name])}
              disabled={!ready}
              onClick={() => toggle(name)}
              className={`relative h-7 w-12 shrink-0 rounded-full ${prefs[name] ? "bg-primary" : "bg-muted"}`}
            >
              <span className={`absolute top-0.5 size-6 rounded-full bg-white transition-transform ${prefs[name] ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
