import Link from "next/link";
import { FlowingText } from "@/components/flowing";
import { when } from "@/components/ui-bits";
import { Progress } from "@/components/ui/progress";
import { percent, show } from "@/lib/display";
import type { Quote } from "@/lib/quote";
import type { FlowRow, LockRow } from "@/lib/protocol";

export type ProductKind = "saving" | "flow" | "expense" | "lock" | "group";

const meta: Record<ProductKind, { title: string; rest: string; art: string; bar: string }> = {
  saving: {
    title: "Saving goal",
    rest: "Holds the deposit until the date. The number stays still.",
    art: "/marks/saving.png",
    bar: "bg-primary",
  },
  flow: {
    title: "Flow goal",
    rest: "Streams the amount back to you, every second.",
    art: "/marks/flow.png",
    bar: "bg-[var(--lavender)]",
  },
  expense: {
    title: "Expense",
    rest: "Streams the amount to someone else.",
    art: "/marks/expense.png",
    bar: "bg-[var(--lavender)]",
  },
  lock: {
    title: "Lock",
    rest: "Principal stays in the lock until the date.",
    art: "/marks/lock.png",
    bar: "bg-[#E39A45]",
  },
  group: {
    title: "Group",
    rest: "Members take turns. The pot is a real distribution.",
    art: "/marks/group.png",
    bar: "bg-[#4C8DFF]",
  },
};

const sizes = {
  sm: "size-9",
  md: "size-12",
  lg: "size-16",
  xl: "size-28",
};

const statusTone: Record<string, string> = {
  Holding: "bg-muted text-foreground",
  Streaming: "bg-motion text-[#0b0f14]",
  Open: "bg-muted text-foreground",
  Paused: "bg-muted text-muted-foreground",
  Waiting: "bg-muted text-muted-foreground",
  Closed: "bg-muted text-muted-foreground",
  Locked: "bg-muted text-foreground",
  Ready: "bg-foreground text-background",
  Active: "bg-muted text-foreground",
  Finished: "bg-muted text-muted-foreground",
  Cancelled: "bg-muted text-muted-foreground",
  "Not started": "bg-muted text-foreground",
};

export function ProductMark({ kind, size = "md", quiet = false }: { kind: ProductKind; size?: keyof typeof sizes; quiet?: boolean }) {
  return (
    <img
      src={meta[kind].art}
      alt=""
      className={`${sizes[size]} shrink-0 object-contain ${quiet ? "opacity-45" : ""}`}
    />
  );
}

function Status({ children }: { children: string }) {
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone[children] ?? "bg-muted text-foreground"}`}>{children}</span>;
}

export function KindIntro({ kind }: { kind: ProductKind }) {
  const item = meta[kind];
  return (
    <div className="mb-4 flex items-center gap-3">
      <ProductMark kind={kind} />
      <div>
        <p className="font-medium">{item.title}</p>
        <p className="text-sm leading-snug text-muted-foreground">{item.rest}</p>
      </div>
    </div>
  );
}

export function KindChoices({ lead }: { lead?: string }) {
  const kinds: ProductKind[] = ["saving", "flow", "expense"];
  return (
    <div className="space-y-3">
      {lead ? <p className="text-sm text-muted-foreground">{lead}</p> : null}
    <ul className="divide-y divide-border">
      {kinds.map((kind) => (
        <li key={kind}>
          <Link href={kind === "saving" ? "/goals/new" : `/goals/new?kind=${kind}`} className="flex items-center gap-3 py-4">
            <ProductMark kind={kind} />
            <span>
              <span className="block font-medium">{meta[kind].title}</span>
              <span className="block text-sm leading-snug text-muted-foreground">{meta[kind].rest}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
    </div>
  );
}

export function goalFigures(flow: FlowRow) {
  const saving = flow.kind === "saving";
  const whole = saving ? flow.goal : flow.reserved;
  const part = saving ? flow.saved : (BigInt(flow.reserved) - BigInt(flow.remaining)).toString();
  const label = saving ? "Saving" : flow.kind === "expense" ? "Expense" : "Flow";
  return { saving, whole, part, label, progress: percent(part, whole) };
}

export function goalStatus(flow: FlowRow, readAt: number) {
  const saving = flow.kind === "saving";
  const live = !saving && flow.active && !flow.paused && !flow.settled && readAt < flow.end && BigInt(flow.remaining) > 0n;
  if (flow.settled) return "Closed";
  if (flow.paused) return "Paused";
  if (live) return "Streaming";
  if (flow.active) return saving ? "Holding" : "Open";
  return "Waiting";
}

export function GoalLink({ flow, readAt, quote }: { flow: FlowRow; readAt: number; quote: Quote }) {
  const { whole, part, label, progress } = goalFigures(flow);
  const live = goalStatus(flow, readAt) === "Streaming";
  const pace = goalStatus(flow, readAt);
  return (
    <Link href={`/goals/${flow.id}`} className="block rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <ProductMark kind={flow.kind} size="sm" quiet={flow.settled} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{flow.name}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
            <Status>{pace}</Status>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <p className="font-display text-sm font-semibold tabular-nums">
          {quote.unit}{" "}
          {live ? <FlowingText readAt={readAt} base={part} perSecond={flow.rate} ceiling={flow.reserved} fine quote={quote} /> : show(part, quote)}
          <span className="font-medium text-muted-foreground"> / {show(whole, quote)}</span>
        </p>
        <p className="shrink-0 text-xs font-medium tabular-nums">{progress}%</p>
      </div>
      <Progress value={progress} indicatorClassName="bg-foreground" className="mt-2 h-1.5 bg-muted" />
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>Ends {when(flow.end || flow.earliestStart)}</span>
        <span aria-hidden>›</span>
      </div>
    </Link>
  );
}

export function LockLink({ lock, quote }: { lock: LockRow; quote: Quote }) {
  const penalty = `${(lock.penaltyBps / 100).toFixed(2).replace(/\.00$/, "")}%`;
  return (
    <Link href={`/vaults/${lock.id}`} className="block rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ProductMark kind="lock" size="sm" quiet={lock.settled} />
          <div>
            <p className="font-medium">{lock.name || "USDCx"}</p>
            <p className="text-xs text-muted-foreground">USDCx</p>
          </div>
        </div>
        <span aria-hidden className="text-muted-foreground">›</span>
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Amount locked</dt>
          <dd className="font-medium tabular-nums">{quote.unit} {show(lock.principal, quote)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Unlock date</dt>
          <dd className="font-medium">{when(lock.end)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Penalty</dt>
          <dd className="font-medium">{penalty} early unlock</dd>
        </div>
      </dl>
      <div className="mt-3">
        <Status>{lock.settled ? "Closed" : "Locked"}</Status>
      </div>
    </Link>
  );
}

export function GroupLink({
  id,
  status,
  contribution,
  members,
  detail,
  quote,
}: {
  id: string;
  status: string;
  contribution: string;
  members: number;
  detail: string;
  quote: Quote;
}) {
  return (
    <Link href={`/groups/${id}`} className="flex gap-3 rounded-2xl border border-border bg-card p-4">
      <ProductMark kind="group" quiet={status === "Finished" || status === "Cancelled"} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">Group {id}</p>
            <p className="text-xs text-muted-foreground">{members} members</p>
          </div>
          <p className="font-display text-sm font-semibold tabular-nums">{show(contribution, quote)}</p>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{status}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </Link>
  );
}
