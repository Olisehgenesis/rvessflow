import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "../../../loading";
import { GroupNav, GroupRotationPlan } from "@/components/group-bits";
import { GroupWhen } from "@/components/group-when";
import { GroupSection } from "@/components/groups-ui";
import { Page } from "@/components/ui-bits";
import { groupLabel } from "@/lib/circle";
import { liveRotationPlan, turnTimes } from "@/lib/group-plan";
import { liveGroupTabs } from "@/lib/group-ui";
import { loadPortfolio } from "@/lib/protocol";
import { viewer } from "@/lib/session";

export default function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <ScheduleBody params={params} />
    </Suspense>
  );
}

async function ScheduleBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const who = await viewer();
  const [data, label] = await Promise.all([loadPortfolio(who), groupLabel(id).catch(() => null)]);
  const group = data.groups.find((item) => item.id === id);
  if (!group) notFound();
  const current = Number(group.cycle || "0");
  const me = group.members.find((member) => member.account.toLowerCase() === data.me.address.toLowerCase());
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
  return (
    <Page title="Schedule" back={`/groups/${group.id}`}>
      <GroupNav current={`/groups/${group.id}/schedule`} links={liveGroupTabs(group.id)} />
      <div className="mt-4 lg:max-w-3xl">
        <GroupSection title={label?.name || `Group ${group.id}`}>
          <p className="mb-4 text-sm leading-relaxed text-[#5C6572]">
            {group.started ? `Turn ${Math.min(current + 1, group.cycles)} of ${group.cycles}. Times come from the start of the rotation.` : "The rotation has not started."}
          </p>
          {group.started && me ? (
            <div className="mb-4">
              <GroupWhen
                paidAt={me.paidAt}
                youReceive={Boolean(plan.turns[current]?.name.endsWith("(you)"))}
                {...turnTimes({
                  startTime: group.startTime,
                  cycle: current,
                  cycles: group.cycles,
                  cycleSeconds: group.cycleSeconds,
                  windowSeconds: group.windowSeconds,
                  graceSeconds: group.graceSeconds,
                  offset: me.offset,
                })}
              />
            </div>
          ) : null}
          <GroupRotationPlan
            youPost={plan.youPost}
            othersCount={plan.othersCount}
            othersPost={plan.othersPost}
            eachTurn={plan.eachTurn}
            turns={plan.turns}
          />
        </GroupSection>
      </div>
    </Page>
  );
}
