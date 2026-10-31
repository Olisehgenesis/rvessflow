import { Suspense } from "react";
import Link from "next/link";
import Loading from "../loading";
import { EmptyGroups } from "@/components/group-bits";
import { GroupCard, groupMark } from "@/components/groups-ui";
import { Page } from "@/components/ui-bits";
import { spanLabel } from "@/lib/cycle";
import { allLabels, draftsIfReady } from "@/lib/circle";
import { labeledGroup } from "@/lib/group-token";
import { MIN_GROUP_MEMBERS } from "@/lib/group-ui";
import { loadPortfolio, networkName } from "@/lib/protocol";
import { viewer } from "@/lib/session";

export default function GroupsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <GroupsBody searchParams={searchParams} />
    </Suspense>
  );
}

async function GroupsBody({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const joined = tab === "joined";
  const who = await viewer();
  const [data, directory, labels] = await Promise.all([loadPortfolio(who), draftsIfReady(who.address), allLabels().catch(() => [])]);
  const nameFor = (id: string, fallback: string) => labels.find((item) => item.ref === id)?.name || fallback;
  const drafts = directory.drafts.filter((draft) => (joined ? draft.role === "member" || draft.role === "applied" : draft.role === "organizer"));
  const groups = data.groups.filter((group) => (joined ? group.creator.toLowerCase() !== data.me.address.toLowerCase() : group.creator.toLowerCase() === data.me.address.toLowerCase()));
  const empty = drafts.length === 0 && groups.length === 0;
  const invited = drafts.filter((draft) => draft.role === "applied");
  const ready = drafts.filter((draft) => draft.role !== "applied");
  const live = groups.filter((group) => group.started && !group.cancelled);
  const waiting = groups.filter((group) => !group.started && !group.cancelled);
  const closed = groups.filter((group) => group.cancelled || group.finalized);
  return (
    <Page
      bleed
      title="Groups"
      action={
        <Link href="/groups/new" className="inline-flex h-10 items-center rounded-full bg-[#D6F34A] px-4 text-sm font-semibold text-[#141414]">
          Create group
        </Link>
      }
    >
      <p className="mb-4 max-w-xl text-sm leading-relaxed text-[#5C6572]">Save together. Each person pays in, then takes a turn receiving the pot.</p>
      <div className="mb-4">
        <Link href="/groups/join" className="text-sm font-medium text-[#141414] underline-offset-4 hover:underline">
          Join with a code
        </Link>
      </div>
      <div className="mb-5 flex gap-2">
        <Tab href="/groups" pressed={!joined}>
          My groups
        </Tab>
        <Tab href="/groups?tab=joined" pressed={joined}>
          Joined
        </Tab>
      </div>
      {directory.down ? <p className="mb-4 text-sm text-[#5C6572]">The member directory is unavailable, so drafts cannot load. Groups already on {networkName} still show here.</p> : null}
      {empty ? (
        <EmptyGroups joined={joined} />
      ) : (
        <div className="space-y-6 lg:max-w-4xl">
          {live.length > 0 ? (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-[#141414]">Active</h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {live.map((group) => {
                  const current = Number(group.cycle || "0");
                  return (
                    <li key={group.id}>
                      <GroupCard
                        href={`/groups/${group.id}`}
                        name={nameFor(group.id, `Group ${group.id}`)}
                        status="Active"
                        contribution={labeledGroup(group.contribution, group.token)}
                        members={`${group.members.length} members`}
                        progress={Math.min(current + 1, group.cycles)}
                        progressMax={group.cycles}
                        next={group.cycleOpen ? `Turn ${current + 1} of ${group.cycles} is open` : `Turn ${current + 1} of ${group.cycles} · ${spanLabel(group.cycleSeconds)} each`}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          {waiting.length > 0 || ready.length > 0 ? (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-[#141414]">Getting ready</h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {ready.map((draft) => (
                  <li key={draft.id}>
                    <GroupCard
                      href={`/groups/draft/${draft.id}`}
                      name={draft.name}
                      status="Draft"
                      contribution={`${draft.contribution} ${draft.token === "gdx" ? "G$" : "USD"}`}
                      members={`${draft.count} of ${MIN_GROUP_MEMBERS} members`}
                      progress={draft.count}
                      progressMax={MIN_GROUP_MEMBERS}
                      next={`${draft.cycles} turns · ${draft.cycleLabel}`}
                      mark={groupMark.create}
                    />
                  </li>
                ))}
                {waiting.map((group) => {
                  const posted = group.members.filter((member) => member.posted).length;
                  return (
                    <li key={group.id}>
                      <GroupCard
                        href={`/groups/${group.id}`}
                        name={nameFor(group.id, `Group ${group.id}`)}
                        status="Not started"
                        contribution={labeledGroup(group.contribution, group.token)}
                        members={`${group.members.length} members`}
                        progress={posted}
                        progressMax={group.members.length}
                        next={`${posted} of ${group.members.length} posted collateral`}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          {invited.length > 0 ? (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-[#141414]">Invitations</h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {invited.map((draft) => (
                  <li key={draft.id}>
                    <GroupCard
                      href={`/groups/draft/${draft.id}`}
                      name={draft.name}
                      status="Pending"
                      contribution={`${draft.contribution} ${draft.token === "gdx" ? "G$" : "USD"}`}
                      members={`${draft.count} members`}
                      next="You applied. Waiting for the organizer."
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {closed.length > 0 ? (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-[#141414]">Closed</h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {closed.map((group) => (
                  <li key={group.id}>
                    <GroupCard
                      href={`/groups/${group.id}`}
                      name={nameFor(group.id, `Group ${group.id}`)}
                      status={group.finalized ? "Finished" : "Cancelled"}
                      contribution={labeledGroup(group.contribution, group.token)}
                      members={`${group.members.length} members`}
                      mark={group.finalized ? groupMark.success : groupMark.people}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <Link href="/groups/explore" className="inline-flex h-12 w-full items-center justify-center rounded-full border border-[#E6EADF] bg-white text-sm font-semibold text-[#141414] lg:w-fit lg:px-6">
            Explore groups
          </Link>
        </div>
      )}
    </Page>
  );
}

function Tab({ href, pressed, children }: { href: string; pressed: boolean; children: string }) {
  return (
    <Link href={href} aria-current={pressed ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-medium ${pressed ? "bg-[#141414] text-white" : "border border-[#E6EADF] bg-white text-[#3A3F47]"}`}>
      {children}
    </Link>
  );
}
