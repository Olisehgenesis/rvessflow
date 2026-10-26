"use client";

export function Greeting({ name }: { name: string }) {
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return (
    <div>
      <p className="text-sm text-muted-foreground">{hello},</p>
      <h1 className="mt-0.5 flex items-center gap-2 font-display text-[1.85rem] leading-none font-semibold tracking-tight">
        {name}
        {hour < 12 ? <Sun /> : null}
      </h1>
    </div>
  );
}

function Sun() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 text-[#E2B100]" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M12 3.2v2.2" />
        <path d="M12 18.6v2.2" />
        <path d="M3.2 12h2.2" />
        <path d="M18.6 12h2.2" />
        <path d="m5.6 5.6 1.6 1.6" />
        <path d="m16.8 16.8 1.6 1.6" />
        <path d="m18.4 5.6-1.6 1.6" />
        <path d="m7.2 16.8-1.6 1.6" />
      </g>
    </svg>
  );
}
