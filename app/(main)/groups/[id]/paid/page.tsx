import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "../../../loading";
import { GroupLead } from "@/components/group-bits";
import { Fact, Facts, Page } from "@/components/ui-bits";
import { labeled } from "@/lib/display";
import { loadQuote } from "@/lib/rates";
import { loadPortfolio } from "@/lib/protocol";
import { viewer } from "@/lib/session";

export default function PaidPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <PaidBody params={params} />
    </Suspense>
  );
}

async function PaidBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const who = await viewer();
  const [data, quote] = await Promise.all([loadPortfolio(who), loadQuote()]);
  const group = data.groups.find((item) => item.id === id);
  if (!group) notFound();
  const me = group.members.find((member) => member.account.toLowerCase() === data.me.address.toLowerCase());
  return (
    <Page title="Contribution" back={`/groups/${group.id}`}>
      <GroupLead src="/marks/paid.png" title="Payment recorded" body="The group contract accepted the last payment from this wallet." />
      <Facts>
        <Fact label="Amount" value={labeled(me?.posted && !group.started ? group.collateral : group.contribution, quote)} />
        <Fact label="Network" value={group.network} />
      </Facts>
      <Link href={`/groups/${group.id}`} className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
        View group
      </Link>
    </Page>
  );
}
