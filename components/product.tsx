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

export function GoalLink({ flow, readAt, quote }: { flow: FlowRow; readAt: number; quote: Quote }) {
  const saving = flow.kind === "saving";
  const live = !saving && flow.active && !flow.paused && !flow.settled && readAt < flow.end && BigInt(flow.remaining) > 0n;
  const whole = saving ? flow.goal : flow.reserved;
  const part = saving ? flow.saved : (BigInt(flow.reserved) - BigInt(flow.remaining)).toString();
  const label = saving ? "Saving goal" : flow.kind === "expense" ? `Expense to ${flow.recipientName}` : "Flow goal";
  const pace = flow.settled ? "Closed" : live ? "Streaming" : flow.paused ? "Paused" : flow.active ? (saving ? "Holding" : "Open") : "Waiting";
  return (
    <Link href={`/goals/${flow.id}`} className="flex gap-3 py-4">
      <ProductMark kind={flow.kind} quiet={flow.settled} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{flow.name}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
          <Status>{pace}</Status>
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <p className="font-display text-sm font-semibold tabular-nums">
            {live ? <FlowingText readAt={readAt} base={part} perSecond={flow.rate} ceiling={flow.reserved} fine quote={quote} /> : show(part, quote)}
            <span className="font-medium text-muted-foreground"> / {show(whole, quote)}</span>
          </p>
          <p className="shrink-0 text-xs text-muted-foreground">{when(flow.end || flow.earliestStart)}</p>
        </div>
        <Progress value={percent(part, whole)} indicatorClassName={meta[flow.kind].bar} className="mt-2 h-1.5" />
      </div>
    </Link>
  );
}

export function LockLink({ lock, quote }: { lock: LockRow; quote: Quote }) {
  const whole = BigInt(lock.target) > 0n ? lock.target : lock.principal;
  return (
    <Link href={`/vaults/${lock.id}`} className="flex gap-3 py-4">
      <ProductMark kind="lock" quiet={lock.settled} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{lock.name}</p>
            <p className="text-xs text-muted-foreground">Lock</p>
          </div>
          <Status>{lock.settled ? "Closed" : "Locked"}</Status>
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <p className="font-display text-sm font-semibold tabular-nums">
            {show(lock.principal, quote)}
            <span className="font-medium text-muted-foreground"> / {show(whole, quote)}</span>
          </p>
          <p className="shrink-0 text-xs text-muted-foreground">{when(lock.end)}</p>
        </div>
        <Progress value={percent(lock.principal, whole)} indicatorClassName={meta.lock.bar} className="mt-2 h-1.5" />
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
    <Link href={`/groups/${id}`} className="flex gap-3 py-4">
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
