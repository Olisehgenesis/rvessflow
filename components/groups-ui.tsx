import Link from "next/link";
import type { ReactNode } from "react";
import { ProfileAvatar } from "@/components/profile-avatar";
import { shortAddress } from "@/lib/display";

export const groupMark = {
  people: "/assets/groups/group-people.jpg",
  create: "/assets/groups/group-creation.jpg",
  empty: "/assets/groups/empty-group.jpg",
  success: "/assets/groups/group-success.jpg",
  save: "/assets/groups/savings-pot.jpg",
  stream: "/assets/groups/stream-bolt.jpg",
  lock: "/assets/groups/lock-vault.jpg",
} as const;

export function GroupSection({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[1.6rem] border border-[#E6EADF] bg-white p-4 shadow-[0_1px_0_rgba(20,20,20,0.04)] sm:p-5">
      {title ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-[family-name:var(--font-manrope)] text-base font-semibold tracking-[-0.03em] text-[#141414]">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function GroupRing({ value, max, caption }: { value: number; max: number; caption: string }) {
  const safeMax = Math.max(max, 1);
  const pct = Math.min(1, Math.max(0, value) / safeMax);
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-[7.25rem] shrink-0">
      <svg viewBox="0 0 88 88" className="-rotate-90" aria-hidden>
        <circle cx="44" cy="44" r={r} fill="none" stroke="#EEF1EA" strokeWidth="8" />
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke="#D6F34A"
          strokeWidth="8"
          strokeDasharray={`${c * pct} ${c}`}
          strokeLinecap="round"
        />
      </svg>
      <p className="absolute inset-0 grid place-items-center px-2 text-center text-sm font-semibold tabular-nums leading-tight text-[#141414]">{caption}</p>
    </div>
  );
}

export function GroupStatus({ label }: { label: string }) {
  const tone =
    label === "Active"
      ? "bg-[#E7F4C4] text-[#141414]"
      : label === "Draft" || label === "Getting ready" || label === "Not started"
        ? "bg-[#F3F7E8] text-[#3A3F47]"
        : label === "Finished"
          ? "bg-[#EEF1EA] text-[#5C6572]"
          : "bg-[#F7F8F4] text-[#5C6572]";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${tone}`}>{label}</span>;
}

export function GroupProgress({ value, max }: { value: number; max: number }) {
  const safeMax = Math.max(max, 1);
  const width = Math.min(100, Math.round((Math.max(value, 0) / safeMax) * 100));
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#F3F7E8]" aria-hidden>
      <div className="h-full rounded-full bg-[#D6F34A]" style={{ width: `${width}%` }} />
    </div>
  );
}

export function GroupStatGrid({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className={`grid gap-2 ${items.length > 2 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2"}`}>
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl bg-[#F7F8F4] px-3 py-3">
          <dt className="text-xs text-[#5C6572]">{item.label}</dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums text-[#141414]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function GroupStepper({ step, labels }: { step: number; labels: string[] }) {
  return (
    <ol className="mb-5 flex gap-2 overflow-x-auto pb-1 text-xs font-medium">
      {labels.map((label, index) => {
        const n = index + 1;
        const on = n === step;
        const done = n < step;
        return (
          <li key={label} className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 ${on ? "bg-[#E7F4C4] text-[#141414]" : done ? "text-[#141414]" : "text-[#9AA3AE]"}`}>
            <span className={`grid size-5 place-items-center rounded-full text-[10px] ${on || done ? "bg-[#141414] text-white" : "bg-[#EEF1EA] text-[#5C6572]"}`}>{n}</span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

export function GroupNeed({ items }: { items: { done: boolean; label: string }[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-start gap-2 text-sm text-[#3A3F47]">
          <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${item.done ? "bg-[#E7F4C4] text-[#141414]" : "bg-[#EEF1EA] text-[#5C6572]"}`}>
            {item.done ? "✓" : ""}
          </span>
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function MemberCard({
  name,
  address,
  role,
  status,
  you,
  action,
}: {
  name: string;
  address?: string;
  role?: string;
  status?: string;
  you?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-[#F7F8F4] px-3 py-2.5">
      <ProfileAvatar seed={address || name} className="size-10" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[#141414]">{you ? `${name} (you)` : name}</p>
        <p className="mt-0.5 truncate text-xs text-[#5C6572]">{[role, status, address ? shortAddress(address) : null].filter(Boolean).join(" · ")}</p>
      </div>
      {action}
    </div>
  );
}

export function GroupCard({
  href,
  name,
  status,
  members,
  contribution,
  progress,
  progressMax,
  next,
  mark,
}: {
  href: string;
  name: string;
  status: string;
  members: string;
  contribution: ReactNode;
  progress?: number;
  progressMax?: number;
  next?: string;
  mark?: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-[1.4rem] border border-[#E6EADF] bg-white p-4 shadow-[0_1px_0_rgba(20,20,20,0.04)] transition-colors hover:border-[#C9D7A4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
    >
      <div className="flex items-start gap-3">
        <img src={mark || groupMark.people} alt="" className="size-12 shrink-0 rounded-2xl object-contain" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-[#141414]">{name}</p>
            <GroupStatus label={status} />
          </div>
          <p className="mt-1 text-sm tabular-nums text-[#3A3F47]">{contribution}</p>
          <p className="mt-0.5 text-xs text-[#5C6572]">{members}</p>
        </div>
      </div>
      {progressMax ? <GroupProgress value={progress ?? 0} max={progressMax} /> : null}
      {next ? <p className="mt-2 text-xs text-[#5C6572]">{next}</p> : null}
    </Link>
  );
}

export function GroupEmpty({
  title,
  body,
  action,
  href,
  secondary,
  secondaryHref,
}: {
  title: string;
  body: string;
  action: string;
  href: string;
  secondary?: string;
  secondaryHref?: string;
}) {
  return (
    <div className="rounded-[1.6rem] border border-[#E6EADF] bg-white px-5 py-8 text-center shadow-[0_1px_0_rgba(20,20,20,0.04)]">
      <img src={groupMark.empty} alt="" className="mx-auto size-20 object-contain" />
      <p className="mt-4 font-[family-name:var(--font-manrope)] text-lg font-semibold tracking-[-0.03em] text-[#141414]">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-[#5C6572]">{body}</p>
      <div className="mt-5 flex flex-col items-center gap-2">
        <Link href={href} className="inline-flex h-12 min-w-40 items-center justify-center rounded-full bg-[#141414] px-5 text-sm font-semibold text-white">
          {action}
        </Link>
        {secondary && secondaryHref ? (
          <Link href={secondaryHref} className="inline-flex h-12 min-w-40 items-center justify-center rounded-full border border-[#E6EADF] bg-white px-5 text-sm font-semibold text-[#141414]">
            {secondary}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function GroupHero({
  mark,
  name,
  status,
  body,
  action,
}: {
  mark: string;
  name: string;
  status: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <img src={mark} alt="" className="size-14 shrink-0 rounded-2xl object-contain" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-[family-name:var(--font-manrope)] text-lg font-semibold tracking-[-0.03em] text-[#141414]">{name}</p>
          <GroupStatus label={status} />
        </div>
        {body ? <p className="mt-1 text-sm leading-relaxed text-[#5C6572]">{body}</p> : null}
      </div>
      {action}
    </div>
  );
}
