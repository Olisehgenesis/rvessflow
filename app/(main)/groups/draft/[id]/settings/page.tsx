import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "../../../../loading";
import { GroupLead, GroupNav } from "@/components/group-bits";
import { Page } from "@/components/ui-bits";
import { readDraft } from "@/lib/circle";
import { draftGroupTabs } from "@/lib/group-ui";

export default function DraftSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <SettingsBody params={params} />
    </Suspense>
  );
}

async function SettingsBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const draft = await readDraft(id);
  if (!draft) notFound();
  const base = `/groups/draft/${draft.id}`;
  return (
    <Page title="Group settings" back={base}>
      <GroupNav current={`${base}/settings`} links={draftGroupTabs(draft.id)} />
      <GroupLead src="/marks/rules.png" title="Before it starts" body="The organizer can still change the name, the amount, and the cycle." />
      <dl className="divide-y divide-border border-y border-border text-sm">
        <Fact label="Group name" value={draft.name} />
        <Fact label="Description" value={draft.description || "None"} />
        <Fact label="Contribution" value={`${draft.contribution} ${draft.token === "gdx" ? "G$" : "USD"}`} />
        <Fact label="Cycle" value={draft.cycleLabel} />
        <Fact label="Total cycles" value={String(draft.cycles)} />
        <Fact label="Each turn" value={draft.plain ? "Paid as a transfer" : "Streams"} />
      </dl>
      <ul className="mt-4 divide-y divide-border border-y border-border text-sm">
        {draft.mine ? <Item href={`${base}/edit`} title="Edit group" body="Change the name, amount, and cycle before this group is started." /> : null}
        <Item href={`${base}/invite`} title="Invite" body={`Code ${draft.code}`} />
        <Item href={base} title="Payout order" body="Turn 1 receives the first cycle. Reorder from Members." />
        <Item href={`${base}/notifications`} title="Notifications" body="Saved on this phone." />
      </ul>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">A group has one organizer. Pausing a running group is not a control the organizer has. Cancel is available on the group after it is on-chain and before the rotation starts.</p>
    </Page>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[14rem] text-right font-medium">{value}</dd>
    </div>
  );
}

function Item({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <li>
      <Link href={href} className="block py-3">
        <span className="block font-medium">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{body}</span>
      </Link>
    </li>
  );
}
