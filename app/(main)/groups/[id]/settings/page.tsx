import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "../../../loading";
import { GroupButton } from "@/components/forms";
import { GroupLead } from "@/components/group-bits";
import { Page } from "@/components/ui-bits";
import { spanLabel } from "@/lib/cycle";
import { groupLabel } from "@/lib/circle";
import { labeled } from "@/lib/display";
import { loadQuote } from "@/lib/rates";
import { loadPortfolio } from "@/lib/protocol";
import { viewer } from "@/lib/session";

export default function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <SettingsBody params={params} />
    </Suspense>
  );
}

async function SettingsBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const who = await viewer();
  const [data, quote, label] = await Promise.all([loadPortfolio(who), loadQuote(), groupLabel(id).catch(() => null)]);
  const group = data.groups.find((item) => item.id === id);
  if (!group) notFound();
  const mine = data.me.address.toLowerCase() === group.creator.toLowerCase();
  const me = group.members.find((member) => member.account.toLowerCase() === data.me.address.toLowerCase());
  const base = `/groups/${group.id}`;
  return (
    <Page title="Group settings" back={base}>
      <GroupLead src="/marks/rules.png" title="This group" body="One organizer. The amount and the cycle stay as they were written on-chain." />
      <dl className="divide-y divide-border border-y border-border text-sm">
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-muted-foreground">Group name</dt>
          <dd className="text-right font-medium">{label?.name || `Group ${group.id}`}</dd>
        </div>
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-muted-foreground">Contribution</dt>
          <dd className="font-medium">{labeled(group.contribution, quote)}</dd>
        </div>
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-muted-foreground">Cycle</dt>
          <dd className="font-medium">{spanLabel(group.cycleSeconds)}</dd>
        </div>
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-muted-foreground">Total cycles</dt>
          <dd className="font-medium">{group.cycles}</dd>
        </div>
      </dl>
      <ul className="mt-4 divide-y divide-border border-y border-border text-sm">
        {mine ? (
          <li>
            <Link href={`${base}/edit`} className="block py-3 font-medium">
              Edit name
            </Link>
          </li>
        ) : null}
        <li>
          <Link href={`${base}/members`} className="block py-3">
            <span className="block font-medium">Payout order</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{group.started ? "The order is locked." : "Reorder from Members until the rotation starts."}</span>
          </Link>
        </li>
        <li>
          <Link href={`${base}/invite`} className="block py-3 font-medium">
            Invite
          </Link>
        </li>
        <li>
          <Link href={`${base}/notifications`} className="block py-3 font-medium">
            Notifications
          </Link>
        </li>
      </ul>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">A group has one organizer. The organizer cannot pause a running group, and cannot change the amount or the cycle after the group is on-chain.</p>
      <div className="mt-4 space-y-3">
        {!group.started && !group.cancelled && me ? <GroupButton id={group.id} fn="exitBeforeStart" label="Leave and take collateral back" /> : null}
        {!group.started && !group.cancelled && mine ? <GroupButton id={group.id} fn="cancelBeforeStart" label="Cancel group" /> : null}
      </div>
    </Page>
  );
}
