import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import Loading from "../../loading";
import { GroupButton } from "@/components/forms";
import { GroupNav } from "@/components/group-bits";
import { GroupHero, GroupRing, GroupSection, GroupStatGrid, MemberCard, groupMark } from "@/components/groups-ui";
import { Page } from "@/components/ui-bits";
import { spanLabel } from "@/lib/cycle";
import { liveRotationPlan, weiTimes } from "@/lib/group-plan";
import { groupNetLabel, parseGroupKey } from "@/lib/group-network";
import { GroupMoney } from "@/components/token-icon";
import { labeledGroup } from "@/lib/group-token";
import { liveGroupTabs } from "@/lib/group-ui";
import { groupLabel } from "@/lib/circle";
import { loadPortfolio } from "@/lib/protocol";
import { viewer } from "@/lib/session";

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <GroupBody params={params} />
    </Suspense>
  );
}

async function GroupBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const who = await viewer();
  const [data, label] = await Promise.all([loadPortfolio(who), groupLabel(id).catch(() => null)]);
  const group = data.groups.find((item) => item.id === id);
  if (!group) notFound();
  const me = group.members.find((member) => member.account.toLowerCase() === data.me.address.toLowerCase());
  const allPosted = group.members.every((member) => member.posted);
  const mine = data.me.address.toLowerCase() === group.creator.toLowerCase();
  const status = group.finalized ? "Finished" : group.started ? "Active" : group.cancelled ? "Cancelled" : "Not started";
  const base = `/groups/${group.id}`;
  const chain = groupNetLabel(parseGroupKey(group.id).net);
  const current = Number(group.cycle || "0");
  const turn = Math.min(current + 1, group.cycles);
  const plan = liveRotationPlan({
    contributionWei: group.contribution,
    token: group.token,
    cycles: group.cycles,
    cycleSeconds: group.cycleSeconds,
    members: group.members.map((member) => ({
      name: member.name,
      you: member.account.toLowerCase() === data.me.address.toLowerCase(),
    })),
  });
  const payLabel =
    !group.started && !group.cancelled && me && !me.posted
      ? `Post ${labeledGroup(group.collateral, group.token)}`
      : group.started && group.cycleOpen
        ? `Pay ${labeledGroup(group.contribution, group.token)}`
        : "";
  const recipient = plan.turns[current];
  const posted = group.members.filter((member) => member.posted).length;
  const ringValue = group.started ? turn : posted;
  const ringMax = group.started ? group.cycles : group.members.length;
  const ringCaption = group.started ? `${turn}/${group.cycles}` : `${posted}/${group.members.length}`;
  return (
    <Page title={label?.name || `Group ${group.id}`} back="/groups">
      <GroupHero
        mark={group.finalized ? groupMark.success : groupMark.people}
        name={label?.name || `Group ${group.id}`}
        status={status}
        body={label?.description || `${group.members.length} people. Organized by ${group.creatorName}.`}
        action={
          mine ? (
            <Link href={`${base}/edit`} className="shrink-0 text-sm font-medium text-[#141414]">
              Edit
            </Link>
          ) : null
        }
      />
      <GroupNav current={base} links={liveGroupTabs(group.id)} />
      <div className="mt-4 space-y-4 lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)] lg:items-start lg:gap-4 lg:space-y-0">
        <div className="space-y-4">
          <GroupSection title="Progress">
            <div className="flex items-center gap-4">
              <GroupRing value={ringValue} max={ringMax} caption={ringCaption} />
              <div className="min-w-0">
                <p className="text-sm font-semibold tabular-nums text-[#141414]">
                  {group.started ? `Turn ${turn} of ${group.cycles}` : "Waiting to start"}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[#5C6572]">
                  {group.started
                    ? recipient
                      ? `This turn goes to ${recipient.name}. Pot ${labeledGroup(weiTimes(group.contribution, group.members.length), group.token)}.`
                      : `Cycle ${turn}.`
                    : `${posted} of ${group.members.length} posted collateral.`}
                </p>
                {group.started ? <p className="mt-2 text-xs text-[#5C6572]">Each turn lasts {spanLabel(group.cycleSeconds)}. Dates are not guessed.</p> : null}
              </div>
            </div>
          </GroupSection>
          <GroupStatGrid
            items={[
              { label: "Total contribution", value: <GroupMoney wei={weiTimes(group.contribution, group.members.length)} token={group.token} /> },
              { label: "Members", value: String(group.members.length) },
              { label: "Frequency", value: spanLabel(group.cycleSeconds) },
              { label: "Blockchain", value: chain },
            ]}
          />
          <GroupSection title="Members" action={<Link href={`${base}/members`} className="text-sm font-medium text-[#141414]">All</Link>}>
            <div className="space-y-2">
              {group.members.slice(0, 5).map((member) => (
                <MemberCard
                  key={member.account}
                  name={member.name}
                  address={member.account}
                  you={member.account.toLowerCase() === data.me.address.toLowerCase()}
                  role={member.account.toLowerCase() === group.creator.toLowerCase() ? "Organizer" : "Member"}
                  status={member.posted ? "Posted" : "Pending"}
                />
              ))}
            </div>
          </GroupSection>
        </div>
        <div className="space-y-4">
          <GroupSection title="Group rules" action={<Link href={`${base}/rules`} className="text-sm font-medium text-[#141414]">All</Link>}>
            <ul className="space-y-2 text-sm text-[#3A3F47]">
              <li className="flex flex-wrap items-center gap-1.5">Contribution <GroupMoney wei={group.contribution} token={group.token} /> per turn</li>
              <li>{spanLabel(group.cycleSeconds)} each cycle</li>
              <li>{group.cycles} turns</li>
              <li>Turn 1 is first in the payout order</li>
            </ul>
          </GroupSection>
          <div className="sticky bottom-20 z-10 space-y-3 rounded-[1.4rem] border border-[#E6EADF] bg-white p-4 lg:static lg:bottom-auto">
            {payLabel ? (
              <Link href={`${base}/pay`} className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[#D6F34A] text-sm font-semibold text-[#141414]">
                {payLabel}
              </Link>
            ) : null}
            {!group.started && !group.cancelled && allPosted && mine ? <GroupButton id={group.id} fn="start" label="Start the rotation" /> : null}
            {group.started && !group.cycleOpen && !group.finalized ? <p className="text-sm text-[#5C6572]">This cycle is not open for payment yet.</p> : null}
            {!payLabel && !(allPosted && mine && !group.started) ? (
              <Link href={`${base}/schedule`} className="inline-flex h-12 w-full items-center justify-center rounded-full border border-[#E6EADF] text-sm font-semibold text-[#141414]">
                View schedule
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </Page>
  );
}
