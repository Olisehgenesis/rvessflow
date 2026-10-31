import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "../../../loading";
import { TurnMove } from "@/components/circle";
import { GroupNav } from "@/components/group-bits";
import { MemberCard } from "@/components/groups-ui";
import { Page } from "@/components/ui-bits";
import { labeledGroup } from "@/lib/group-token";
import { liveGroupTabs } from "@/lib/group-ui";
import { loadPortfolio } from "@/lib/protocol";
import { viewer } from "@/lib/session";

export default function MembersPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <MembersBody params={params} />
    </Suspense>
  );
}

async function MembersBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const who = await viewer();
  const data = await loadPortfolio(who);
  const group = data.groups.find((item) => item.id === id);
  if (!group) notFound();
  const mine = data.me.address.toLowerCase() === group.creator.toLowerCase();
  const order = group.payout.length === group.members.length ? group.payout : group.members.map((_, index) => index);
  const canMove = Boolean(mine && group.canArrange && !group.started && !group.cancelled);
  const base = `/groups/${group.id}`;
  return (
    <Page title="Members" back={base}>
      <p className="mb-3 text-sm leading-relaxed text-[#5C6572]">{canMove ? "Turn 1 receives the first cycle. The order locks when the rotation starts." : "The order is locked."}</p>
      <GroupNav current={`${base}/members`} links={liveGroupTabs(group.id)} />
      <ul className="mt-4 space-y-2">
        {order.map((memberIndex, place) => {
          const member = group.members[memberIndex];
          if (!member) return null;
          const you = member.account.toLowerCase() === data.me.address.toLowerCase();
          return (
            <li key={member.account}>
              <MemberCard
                name={member.name}
                address={member.account}
                you={you}
                role={`Turn ${place + 1}`}
                status={member.posted ? `${labeledGroup(group.collateral, group.token)} posted` : "Needs collateral"}
              />
              {canMove ? (
                <div className="mt-2">
                  <TurnMove id={group.id} from={place} first={place === 0} last={place === order.length - 1} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {mine ? (
        <Link href={`${base}/invite`} className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-[#D6F34A] text-sm font-semibold text-[#141414]">
          Invite members
        </Link>
      ) : null}
    </Page>
  );
}
