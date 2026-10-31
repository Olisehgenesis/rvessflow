import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "../../../loading";
import { GroupNav, GroupRotationPlan } from "@/components/group-bits";
import { GroupSection } from "@/components/groups-ui";
import { Page } from "@/components/ui-bits";
import { groupLabel } from "@/lib/circle";
import { liveRotationPlan } from "@/lib/group-plan";
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
            Payout order is set by the organizer. Expected times are offsets from start, not calendar dates invented here.
            {group.started ? ` Current turn ${Math.min(current + 1, group.cycles)} of ${group.cycles}.` : " The rotation has not started."}
          </p>
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
