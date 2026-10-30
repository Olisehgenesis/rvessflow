import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "../../../loading";
import { GroupPay } from "@/components/forms";
import { GroupLead } from "@/components/group-bits";
import { Notice, Page } from "@/components/ui-bits";
import { labeledGroup, groupTokenKindFromAddress } from "@/lib/group-token";
import { loadPayChoices } from "@/lib/holdings";
import { parseGroupKey } from "@/lib/group-network";
import { loadPortfolio } from "@/lib/protocol";
import { viewer } from "@/lib/session";

export default function PayPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <PayBody params={params} />
    </Suspense>
  );
}

async function PayBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const who = await viewer();
  const [data, choices] = await Promise.all([loadPortfolio(who), loadPayChoices(who.address)]);
  const group = data.groups.find((item) => item.id === id);
  if (!group) notFound();
  const me = group.members.find((member) => member.account.toLowerCase() === data.me.address.toLowerCase());
  const collateral = !group.started && !group.cancelled && me && !me.posted;
  const cycle = group.started && group.cycleOpen;
  const gdx = groupTokenKindFromAddress(group.token) === "gdx";
  const net = parseGroupKey(group.id).net;
  const payChoices = choices.filter((choice) => {
    const onCelo = (choice.network ?? "").toLowerCase().includes("celo");
    if (net === "celo" ? !onCelo : onCelo) return false;
    return gdx ? choice.pay === "gdx" : choice.pay !== "gdx";
  });
  return (
    <Page title={collateral ? "Post collateral" : "Make a contribution"} back={`/groups/${group.id}`}>
      <GroupLead src="/marks/paid.png" title={collateral ? "Collateral" : "This cycle"} body={collateral ? "This stays with the group until it finishes or is cancelled." : `Cycle ${Number(group.cycle) + 1} of ${group.cycles}.`} />
      <p className="mb-4 font-display text-4xl font-semibold tracking-tight">{labeledGroup(collateral ? group.collateral : group.contribution, group.token)}</p>
      {collateral ? (
        <>
          <Notice>This moves collateral into the group, plus the 0.3% protocol fee. You get it back if the group is cancelled before it starts, or when it finishes.</Notice>
          <div className="mt-4">
            <GroupPay id={group.id} fn="postCollateral" label="Pay now" superWei={group.collateral} choices={payChoices} />
          </div>
        </>
      ) : null}
      {cycle ? <GroupPay id={group.id} fn="contribute" label="Pay now" superWei={group.contribution} choices={payChoices} /> : null}
      {!collateral && !cycle ? <p className="text-sm text-muted-foreground">There is nothing to pay on this group right now.</p> : null}
    </Page>
  );
}
