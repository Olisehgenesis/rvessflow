import { Suspense } from "react";
import { notFound } from "next/navigation";
import Loading from "../../loading";
import { GroupButton } from "@/components/forms";
import { ProductMark } from "@/components/product";
import { Fact, Facts, Notice, Page } from "@/components/ui-bits";
import { spanLabel } from "@/lib/cycle";
import { labeled } from "@/lib/display";
import { loadQuote } from "@/lib/rates";
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
  const [data, quote] = await Promise.all([loadPortfolio(who), loadQuote()]);
  const group = data.groups.find((item) => item.id === id);
  if (!group) notFound();
  const me = group.members.find((member) => member.account.toLowerCase() === data.me.address.toLowerCase());
  const allPosted = group.members.every((member) => member.posted);
  const mine = data.me.address.toLowerCase() === group.creator.toLowerCase();
  return (
    <Page title={`Group ${group.id}`} back="/groups">
      <div className="mb-4">
        <ProductMark kind="group" size="xl" quiet={group.finalized || group.cancelled} />
        <p className="mt-3 text-sm text-muted-foreground">
          {group.finalized ? "Finished" : group.started ? (group.cycleOpen ? `Cycle ${Number(group.cycle) + 1} is open` : "Between cycles") : group.cancelled ? "Cancelled" : "Waiting for collateral"}
        </p>
      </div>
      <Facts>
        <Fact label="Contribution" value={labeled(group.contribution, quote)} />
        <Fact label="Collateral" value={labeled(group.collateral, quote)} />
        <Fact label="Cycles" value={`${group.cycles}, ${spanLabel(group.cycleSeconds)} each`} />
        <Fact label="Window" value={`${spanLabel(group.windowSeconds)} to pay, then ${spanLabel(group.graceSeconds)} of grace`} />
        <Fact label="Created by" value={group.creatorName} />
      </Facts>
      <h2 className="mt-6 mb-2 text-sm font-semibold">Members</h2>
      <ul className="divide-y divide-border border-y border-border">
        {group.members.map((member) => {
          const you = member.account.toLowerCase() === data.me.address.toLowerCase();
          return (
            <li key={member.account} className="py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{you ? `${member.name} (you)` : member.name}</p>
                <p className="text-xs text-muted-foreground">{member.posted ? "Collateral in" : "Not posted"}</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Given {labeled(member.given, quote)}. Received {labeled(member.received, quote)}. Owed {labeled(member.owed, quote)}.
                {member.missed ? ` Missed ${member.missed}.` : ""}
              </p>
            </li>
          );
        })}
      </ul>
      <div className="mt-5 space-y-3">
        {!group.started && !group.cancelled && me && !me.posted ? (
          <>
            <Notice>Posting collateral moves {labeled(group.collateral, quote)} from your wallet into the group. You get it back if the group is cancelled before it starts, or when it finishes.</Notice>
            <GroupButton id={group.id} fn="postCollateral" label="Post collateral" />
          </>
        ) : null}
        {!group.started && !group.cancelled && allPosted && mine ? <GroupButton id={group.id} fn="start" label="Start the rotation" /> : null}
        {group.started && group.cycleOpen ? <GroupButton id={group.id} fn="contribute" label="Pay this cycle" /> : null}
        {!group.started && !group.cancelled && me ? <GroupButton id={group.id} fn="exitBeforeStart" label="Leave and take collateral back" /> : null}
        {!group.started && !group.cancelled && mine ? <GroupButton id={group.id} fn="cancelBeforeStart" label="Cancel the group" /> : null}
        {(group.cancelled || group.finalized) && me && BigInt(me.collateral) > 0n ? (
          <GroupButton id={group.id} fn="claimCollateral" label="Claim collateral" />
        ) : null}
      </div>
    </Page>
  );
}
