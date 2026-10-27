import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "../../../loading";
import { CopyButton } from "@/components/copy-button";
import { ShareLink } from "@/components/share-link";
import { GroupLead } from "@/components/group-bits";
import { Page } from "@/components/ui-bits";
import { ensureGroupCode, groupLabel } from "@/lib/circle";
import { loadPortfolio } from "@/lib/protocol";
import { viewer } from "@/lib/session";
import QRCode from "qrcode";

export default function GroupInvitePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <InviteBody params={params} />
    </Suspense>
  );
}

async function InviteBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const who = await viewer();
  const data = await loadPortfolio(who);
  const group = data.groups.find((item) => item.id === id);
  if (!group) notFound();
  const mine = data.me.address.toLowerCase() === group.creator.toLowerCase();
  const existing = await groupLabel(id).catch(() => null);
  const label = existing?.code ? existing : mine ? await ensureGroupCode(id, existing?.name || `Group ${group.id}`) : null;
  if (!label?.code) {
    return (
      <Page title="Invite" back={`/groups/${group.id}`}>
        <GroupLead src="/marks/invite.png" title="No code yet" body="The organizer has not shared a code for this group." />
      </Page>
    );
  }
  const host = (await headers()).get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const link = `${proto}://${host}/groups/join?code=${label.code}`;
  const qr = await QRCode.toDataURL(link, { margin: 1, width: 280, color: { dark: "#0b0f14", light: "#ffffff" } });
  const name = label.name || `Group ${group.id}`;
  return (
    <Page title="Invite" back={`/groups/${group.id}`}>
      <GroupLead src="/marks/invite.png" title={label.code} body={`Share this with people you want in ${name}. They type the code or scan the QR.`} />
      <section className="mt-5 rounded-3xl border border-border bg-card p-5">
        <Image src={qr} alt={`QR code for ${name}`} width={224} height={224} unoptimized className="mx-auto size-56" />
        <p className="mt-4 break-all text-center text-sm leading-relaxed">{link}</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <CopyButton value={label.code} label="Copy code" />
          <CopyButton value={link} label="Copy link" />
          <ShareLink url={link} />
        </div>
      </section>
      <Link href={`/groups/${group.id}`} className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
        Done
      </Link>
    </Page>
  );
}
