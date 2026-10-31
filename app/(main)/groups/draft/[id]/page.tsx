import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import Loading from "../../../loading";
import { DraftStart } from "@/components/circle";
import { GroupNav } from "@/components/group-bits";
import { GroupHero, GroupNeed, GroupStatGrid, groupMark } from "@/components/groups-ui";
import { Page } from "@/components/ui-bits";
import { readDraft } from "@/lib/circle";
import { MIN_GROUP_MEMBERS, draftGroupTabs } from "@/lib/group-ui";

export default function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <DraftBody params={params} />
    </Suspense>
  );
}

async function DraftBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const draft = await readDraft(id);
  if (!draft) notFound();
  const base = `/groups/draft/${draft.id}`;
  const need = Math.max(MIN_GROUP_MEMBERS - draft.members.length, 0);
  const next = draft.mine
    ? need > 0
      ? `Add ${need} more ${need === 1 ? "person" : "people"} to start.`
      : "Start the group on-chain when the order looks right."
    : draft.applied
      ? "Waiting for the organizer to add you."
      : draft.open
        ? "Apply if you want to join this draft."
        : "This draft is closed to applications.";
  return (
    <Page title={draft.name} back="/groups">
      <GroupHero
        mark={groupMark.create}
        name={draft.name}
        status="Draft"
        body={draft.description || "Add people, then start on-chain."}
        action={
          draft.mine ? (
            <Link href={`${base}/edit`} className="shrink-0 text-sm font-medium text-[#141414]">
              Edit
            </Link>
          ) : null
        }
      />
      <GroupStatGrid
        items={[
          { label: "Each turn", value: `${draft.contribution} ${draft.token === "gdx" ? "G$" : "USD"}` },
          { label: "Members", value: `${draft.members.length} of ${MIN_GROUP_MEMBERS}` },
          { label: "How often", value: draft.cycleLabel },
          { label: "Chain", value: draft.networkLabel },
        ]}
      />
      <GroupNav current={base} links={draftGroupTabs(draft.id)} />
      <div className="mt-4 space-y-4 lg:max-w-3xl">
        <div className="rounded-[1.6rem] border border-[#E6EADF] bg-white p-4">
          <p className="text-sm font-semibold text-[#141414]">What is next</p>
          <p className="mt-1 text-sm leading-relaxed text-[#5C6572]">{next}</p>
          {draft.mine && need > 0 ? (
            <Link href={`${base}/invite`} className="mt-4 inline-flex h-12 items-center justify-center rounded-full bg-[#D6F34A] px-5 text-sm font-semibold text-[#141414]">
              Add members
            </Link>
          ) : null}
          <div className="mt-4">
            <GroupNeed
              items={[
                { done: true, label: "Terms saved" },
                { done: draft.members.length >= MIN_GROUP_MEMBERS, label: `${draft.members.length} of ${MIN_GROUP_MEMBERS} members` },
                { done: draft.applications.length === 0, label: draft.applications.length ? `${draft.applications.length} waiting to be added` : "No pending applications" },
              ]}
            />
          </div>
        </div>
        {draft.mine ? <DraftStart draft={draft} /> : null}
      </div>
    </Page>
  );
}
