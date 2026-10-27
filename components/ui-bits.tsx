import { TopBar } from "@/components/top-bar";
import { money, show } from "@/lib/display";
import type { Quote } from "@/lib/quote";

export function Page({ title = "", back, children, action, bleed = false }: { title?: string; back?: string; children: React.ReactNode; action?: React.ReactNode; bleed?: boolean }) {
  return (
    <main className="px-4 pb-8 lg:px-0">
      <div className={bleed ? "lg:max-w-none" : "lg:mx-auto lg:max-w-5xl"}>
        <TopBar title={title} back={back} action={action} />
        {children}
      </div>
    </main>
  );
}

export function Amount({ value, unit, quote }: { value: string; unit?: string; quote?: Quote }) {
  return (
    <p className="flex items-baseline gap-2">
      <span className="font-display text-[2.6rem] font-semibold leading-none tracking-tight tabular-nums">{quote ? show(value, quote) : money(value)}</span>
      <span className="text-sm font-medium text-muted-foreground">{quote?.unit ?? unit ?? "USD"}</span>
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

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function when(unix: number): string {
  if (!unix) return "Not started";
  const date = new Date(unix * 1000);
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

export function activityWhen(unix: number): string {
  const date = new Date(unix * 1000);
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startThat = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((startToday - startThat) / 86400000);
  if (diff === 0) return `Today · ${time}`;
  if (diff === 1) return `Yesterday · ${time}`;
  return `${date.getDate()} ${months[date.getMonth()]} · ${time}`;
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
