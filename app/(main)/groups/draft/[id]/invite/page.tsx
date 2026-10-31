import Image from "next/image";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "../../../../loading";
import { DraftPeople } from "@/components/circle";
import { CopyButton } from "@/components/copy-button";
import { ShareLink } from "@/components/share-link";
import { GroupNav } from "@/components/group-bits";
import { GroupSection } from "@/components/groups-ui";
import { Page } from "@/components/ui-bits";
import { readDraft } from "@/lib/circle";
import { MIN_GROUP_MEMBERS, draftGroupTabs } from "@/lib/group-ui";
import QRCode from "qrcode";

export default function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <InviteBody params={params} />
    </Suspense>
  );
}

async function InviteBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const draft = await readDraft(id);
  if (!draft) notFound();
  const host = (await headers()).get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const link = `${proto}://${host}/groups/join?code=${draft.code}`;
  const qr = await QRCode.toDataURL(link, { margin: 1, width: 280, color: { dark: "#0b0f14", light: "#ffffff" } });
  const pending = Math.max(MIN_GROUP_MEMBERS - draft.members.length, 0);
  return (
    <Page title="Add members" back={`/groups/draft/${draft.id}`}>
      <GroupNav current={`/groups/draft/${draft.id}/invite`} links={draftGroupTabs(draft.id)} />
      <p className="mt-4 text-sm leading-relaxed text-[#5C6572]">
        You need at least {MIN_GROUP_MEMBERS} people to start. {pending ? `${pending} more ${pending === 1 ? "person" : "people"} still needed.` : "This draft has enough people."}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-2 lg:max-w-xl">
        <div className="rounded-2xl bg-[#F7F8F4] px-3 py-3">
          <dt className="text-xs text-[#5C6572]">Minimum members</dt>
          <dd className="mt-1 text-sm font-semibold text-[#141414]">{MIN_GROUP_MEMBERS}</dd>
        </div>
        <div className="rounded-2xl bg-[#F7F8F4] px-3 py-3">
          <dt className="text-xs text-[#5C6572]">Pending invitations</dt>
          <dd className="mt-1 text-sm font-semibold text-[#141414]">{draft.applications.length}</dd>
        </div>
      </dl>
      <div className="mt-4 space-y-4 lg:max-w-3xl">
        <DraftPeople draft={draft} />
        <GroupSection title="Share a link">
          <p className="mb-3 text-sm leading-relaxed text-[#5C6572]">Anyone with the code can open the join page. Phone and email only match people who already saved them in Settings.</p>
          <Image src={qr} alt={`QR code for ${draft.name}`} width={224} height={224} unoptimized className="mx-auto size-40" />
          <p className="mt-3 break-all text-center text-sm text-[#5C6572]">{link}</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <CopyButton value={draft.code} label="Copy code" />
            <CopyButton value={link} label="Copy link" />
            <ShareLink url={link} />
          </div>
        </GroupSection>
      </div>
    </Page>
  );
}
