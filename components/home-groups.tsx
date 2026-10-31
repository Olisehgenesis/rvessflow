import Link from "next/link";
import { GroupCard, groupMark } from "@/components/groups-ui";
import { spanLabel } from "@/lib/cycle";
import { labeledGroup } from "@/lib/group-token";
import { MIN_GROUP_MEMBERS } from "@/lib/group-ui";
import type { DraftCard } from "@/lib/circle";
import type { Portfolio } from "@/lib/protocol";

export function HomeGroups({
  groups,
  drafts,
  names,
}: {
  groups: Portfolio["groups"];
  drafts: DraftCard[];
  names: { ref: string; name: string }[];
}) {
  const nameFor = (id: string, fallback: string) => names.find((item) => item.ref === id)?.name || fallback;
  const live = groups.filter((group) => group.started && !group.cancelled).slice(0, 3);
  const ready = drafts.filter((draft) => draft.role === "organizer" || draft.role === "member").slice(0, 3);
  if (live.length === 0 && ready.length === 0) return null;
  const cards = [
    ...live.map((group) => {
      const current = Number(group.cycle || "0");
      return (
        <li key={group.id}>
          <GroupCard
            href={`/groups/${group.id}`}
            name={nameFor(group.id, `Group ${group.id}`)}
            status="Active"
            contribution={labeledGroup(group.contribution, group.token)}
            members={`${group.members.length} members`}
            progress={Math.min(current + 1, group.cycles)}
            progressMax={group.cycles}
            next={group.cycleOpen ? `Turn ${current + 1} of ${group.cycles} is open` : `Turn ${current + 1} of ${group.cycles} · ${spanLabel(group.cycleSeconds)} each`}
          />
        </li>
      );
    }),
    ...ready.map((draft) => (
      <li key={draft.id}>
        <GroupCard
          href={`/groups/draft/${draft.id}`}
          name={draft.name}
          status="Draft"
          contribution={`${draft.contribution} ${draft.token === "gdx" ? "G$" : "USD"}`}
          members={`${draft.count} of ${MIN_GROUP_MEMBERS} members`}
          progress={draft.count}
          progressMax={MIN_GROUP_MEMBERS}
          next={`${draft.cycles} turns · ${draft.cycleLabel}`}
          mark={groupMark.create}
        />
      </li>
    )),
  ].slice(0, 3);
  return (
    <section>
      <div className="mb-2 flex items-end justify-between">
        <h2 className="text-base font-semibold text-[#141414]">Your groups</h2>
        <Link href="/groups" className="text-sm font-medium text-[#5C6572]">
          View all
        </Link>
      </div>
      <ul className="grid gap-3 lg:grid-cols-3">{cards}</ul>
    </section>
  );
}
