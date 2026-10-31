import Link from "next/link";
import type { TurnShare } from "@/lib/group-plan";
import { GroupEmpty, groupMark } from "@/components/groups-ui";

export function GroupLead({ src, title, body }: { src: string; title: string; body?: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <img src={src} alt="" className="size-12 shrink-0 rounded-2xl object-contain" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#141414]">{title}</p>
        {body ? <p className="mt-0.5 text-sm leading-snug text-[#5C6572]">{body}</p> : null}
      </div>
    </div>
  );
}

export function GroupNav({
  links,
  current,
}: {
  links: { href: string; label: string }[];
  current?: string;
}) {
  return (
    <nav className="mt-4 -mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0" aria-label="Group">
      <ul className="flex w-max gap-2 pb-1">
        {links.map((link) => {
          const on = current === link.href;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={on ? "page" : undefined}
                className={`inline-flex h-10 items-center rounded-full px-3.5 text-sm font-medium ${on ? "bg-[#141414] text-white" : "border border-[#E6EADF] bg-white text-[#141414]"}`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function StatStrip({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl bg-[#F7F8F4] px-3 py-3">
          <dt className="text-xs text-[#5C6572]">{item.label}</dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums text-[#141414]">{item.value}</dd>
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
      <dl className="divide-y divide-[#E6EADF] overflow-hidden rounded-2xl bg-[#F7F8F4] text-sm">
        <div className="flex items-start justify-between gap-4 px-4 py-3">
          <dt className="text-[#5C6572]">You post</dt>
          <dd className="text-right font-semibold tabular-nums text-[#141414]">{youPost}</dd>
        </div>
        <div className="flex items-start justify-between gap-4 px-4 py-3">
          <dt className="text-[#5C6572]">
            {othersCount <= 0
              ? "Other members post"
              : othersCount === 1
                ? "The other member posts"
                : `Each of the other ${othersCount} members posts`}
          </dt>
          <dd className="text-right font-semibold tabular-nums text-[#141414]">{othersPost}</dd>
        </div>
        <div className="flex items-start justify-between gap-4 px-4 py-3">
          <dt className="text-[#5C6572]">Each turn receives</dt>
          <dd className="text-right font-semibold tabular-nums text-[#141414]">{eachTurn}</dd>
        </div>
      </dl>
      {turns.length > 0 ? (
        <ol className="divide-y divide-[#E6EADF] overflow-hidden rounded-2xl border border-[#E6EADF] bg-white text-sm">
          {turns.map((turn) => (
            <li key={turn.turn} className="px-4 py-3">
              <p className="font-medium text-[#141414]">
                Turn {turn.turn}
                <span className="font-normal text-[#5C6572]"> · </span>
                {turn.name}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-[#5C6572]">
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
    <GroupEmpty
      title={joined ? "You have not joined a group" : "No groups yet"}
      body={
        joined
          ? "Ask an organizer for a code, or look for a group that is open."
          : "Create a rotating savings group, or join one with a code. You need three people to start."
      }
      action={joined ? "Join with a code" : "Create group"}
      href={joined ? "/groups/join" : "/groups/new"}
      secondary="Explore groups"
      secondaryHref="/groups/explore"
    />
  );
}

export { groupMark };
