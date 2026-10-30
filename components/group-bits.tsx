import Link from "next/link";
import type { TurnShare } from "@/lib/group-plan";

export function GroupLead({ src, title, body }: { src: string; title: string; body?: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <img src={src} alt="" className="size-12 shrink-0 object-contain" />
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {body ? <p className="text-sm leading-snug text-muted-foreground">{body}</p> : null}
      </div>
    </div>
  );
}

export function GroupNav({
  links,
}: {
  links: { href: string; label: string }[];
}) {
  return (
    <ul className="mt-4 divide-y divide-border border-y border-border text-sm">
      {links.map((link) => (
        <li key={link.href}>
          <Link href={link.href} className="block py-3 font-medium">
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function StatStrip({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-border bg-card px-3 py-3">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 text-sm font-semibold">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function GroupRotationPlan({
  youPost,
  othersCount,
  othersPost,
  eachTurn,
  turns,
}: {
  youPost: string;
  othersCount: number;
  othersPost: string;
  eachTurn: string;
  turns: TurnShare[];
}) {
  return (
    <div className="space-y-3">
      <dl className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card text-sm">
        <div className="flex items-start justify-between gap-4 px-4 py-3">
          <dt className="text-muted-foreground">You post</dt>
          <dd className="text-right font-semibold tabular-nums">{youPost}</dd>
        </div>
        <div className="flex items-start justify-between gap-4 px-4 py-3">
          <dt className="text-muted-foreground">
            {othersCount <= 0
              ? "Other members post"
              : othersCount === 1
                ? "The other member posts"
                : `Each of the other ${othersCount} members posts`}
          </dt>
          <dd className="text-right font-semibold tabular-nums">{othersPost}</dd>
        </div>
        <div className="flex items-start justify-between gap-4 px-4 py-3">
          <dt className="text-muted-foreground">Each turn receives</dt>
          <dd className="text-right font-semibold tabular-nums">{eachTurn}</dd>
        </div>
      </dl>
      {turns.length > 0 ? (
        <ol className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card text-sm">
          {turns.map((turn) => (
            <li key={turn.turn} className="px-4 py-3">
              <p className="font-medium">
                Turn {turn.turn}
                <span className="font-normal text-muted-foreground"> · </span>
                {turn.name}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Gets {turn.receives} · {turn.when}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

export function EmptyGroups({ joined = false }: { joined?: boolean }) {
  return (
    <div className="py-2">
      <GroupLead
        src={joined ? "/marks/explore.png" : "/marks/group.png"}
        title={joined ? "You have not joined a group" : "No groups yet"}
        body={joined ? "Ask an organizer for a code, or look for a group that is open." : "Join a group with a code, or create one and invite people you trust."}
      />
      <div className="flex flex-col gap-2">
        <Link href={joined ? "/groups/join" : "/groups/new"} className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground lg:self-start lg:px-6">
          {joined ? "Join with a code" : "Create group"}
        </Link>
        <Link href="/groups/explore" className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-card px-5 text-sm font-medium lg:self-start lg:px-6">
          Explore groups
        </Link>
      </div>
    </div>
  );
}
