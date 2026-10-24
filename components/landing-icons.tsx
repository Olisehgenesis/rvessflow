export type MarkName = "save" | "stream" | "lock" | "groups" | "swirl";

export function ProductGlyph({ name, className }: { name: MarkName; className?: string }) {
  const shared = {
    viewBox: "0 0 24 24",
    className,
    "aria-hidden": true as const,
  };

  if (name === "save") {
    return (
      <svg {...shared} fill="none">
        <path d="M12 21.2V10.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M12 15.4c-4.4.3-6.7-2.1-6.4-6.4 4.2.5 6.2 2.7 6.4 6.4Z" fill="currentColor" />
        <path d="M12 13.5c4-.4 6.3-2.2 6.7-5.8-3.8.3-5.8 2.3-6.7 5.8Z" fill="currentColor" />
      </svg>
    );
  }

  if (name === "stream") {
    return (
      <svg {...shared}>
        <path d="M13.4 2.6 6.2 13.1h4.6l-1 8.3 7.8-11.4h-4.8l.6-7.4Z" fill="currentColor" />
      </svg>
    );
  }

  if (name === "lock") {
    return (
      <svg {...shared} fill="none">
        <rect x="5" y="10.2" width="14" height="9.4" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 10.2V7.8a4 4 0 0 1 8 0v2.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "swirl") {
    return (
      <svg {...shared} fill="none">
        <path
          d="M16.2 7.2c-4.2-.6-7.4 2.2-6.6 5.6.7 2.8 3.6 4 5.6 2.8 1.6-1 1.8-2.8.6-3.6-.8-.6-2-.2-2.3.7"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg {...shared}>
      <circle cx="9" cy="8" r="2.15" fill="currentColor" />
      <circle cx="16.1" cy="9.1" r="1.65" fill="currentColor" />
      <path d="M3.8 18.8c.55-2.7 2.45-4.15 4.95-4.15s4.4 1.45 4.95 4.15" fill="currentColor" />
      <path d="M13.2 18.8c.35-2.05 1.85-3.25 3.45-3.25 1.55 0 2.9 1.05 3.4 3.25" fill="currentColor" />
    </svg>
  );
}
