import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "../../../loading";
import { TurnMove } from "@/components/circle";
import { GroupLead } from "@/components/group-bits";
import { Page } from "@/components/ui-bits";
import { labeled } from "@/lib/display";
import { loadQuote } from "@/lib/rates";
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
  const [data, quote] = await Promise.all([loadPortfolio(who), loadQuote()]);
  const group = data.groups.find((item) => item.id === id);
  if (!group) notFound();
  const mine = data.me.address.toLowerCase() === group.creator.toLowerCase();
  const order = group.payout.length === group.members.length ? group.payout : group.members.map((_, index) => index);
  const canMove = Boolean(mine && group.canArrange && !group.started && !group.cancelled);
  return (
    <Page title={`Members (${group.members.length})`} back={`/groups/${group.id}`}>
      <GroupLead src="/marks/group.png" title="Turn order" body={canMove ? "Turn 1 receives the first cycle. The order locks when the rotation starts." : "The order is locked."} />
      <ul className="divide-y divide-border border-y border-border">
        {order.map((memberIndex, place) => {
          const member = group.members[memberIndex];
          if (!member) return null;
          const you = member.account.toLowerCase() === data.me.address.toLowerCase();
          return (
            <li key={member.account} className="py-3 text-sm">
              <p className="font-medium">
                Turn {place + 1}
                <span className="font-normal text-muted-foreground"> · </span>
                {you ? `${member.name} (you)` : member.name}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {member.posted ? "Collateral in" : "Collateral not posted"}
                {member.missed ? ` · Missed ${member.missed}` : ""}
                {` · Received ${labeled(member.received, quote)}`}
              </p>
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
        <Link href={`/groups/${group.id}/invite`} className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
          Invite members
        </Link>
      ) : null}
    </Page>
  );
}
