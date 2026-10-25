import Link from "next/link";
import { money, show } from "@/lib/display";
import type { Quote } from "@/lib/quote";

export function Page({ title, back, children, action }: { title: string; back?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <main className="px-4 pb-8 pt-4">
      <header className={`mb-5 flex items-center gap-2 ${back ? "" : "justify-between"}`}>
        {back ? (
          <Link href={back} className="grid size-9 shrink-0 place-items-center text-xl text-foreground" aria-label="Back">
            ‹
          </Link>
        ) : null}
        <h1 className={`font-display text-lg font-semibold tracking-tight ${back ? "flex-1 text-center" : ""}`}>{title}</h1>
        {action ? <div className="shrink-0">{action}</div> : back ? <span className="size-9 shrink-0" /> : null}
      </header>
      {children}
    </main>
  );
}

export function Amount({ value, unit, quote }: { value: string; unit?: string; quote?: Quote }) {
  return (
    <p className="flex items-baseline gap-2">
      <span className="font-display text-[2.6rem] font-semibold leading-none tracking-tight tabular-nums">{quote ? show(value, quote) : money(value)}</span>
      <span className="text-sm font-medium text-muted-foreground">{quote?.unit ?? unit ?? "USDCx"}</span>
    </p>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{money(value)}</p>
    </div>
  );
}

export function Facts({ children }: { children: React.ReactNode }) {
  return <dl className="divide-y divide-border border-y border-border text-sm">{children}</dl>;
}

export function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[16rem] text-right font-medium">{value}</dd>
    </div>
  );
}

export function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-muted px-4 py-3 text-sm leading-relaxed text-foreground">{children}</p>;
}

export function ErrorNote({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>;
}

export function when(unix: number): string {
  if (!unix) return "Not started";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(unix * 1000);
}

export function durationLabel(seconds: number): string {
  if (seconds % (30 * 86400) === 0 && seconds >= 30 * 86400) {
    const months = seconds / (30 * 86400);
    return `${months} month${months === 1 ? "" : "s"}`;
  }
  if (seconds % 86400 === 0) {
    const days = seconds / 86400;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${seconds} seconds`;
}
