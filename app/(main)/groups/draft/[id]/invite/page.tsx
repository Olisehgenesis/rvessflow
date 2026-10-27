import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "../../../../loading";
import { CopyButton } from "@/components/copy-button";
import { ShareLink } from "@/components/share-link";
import { GroupLead } from "@/components/group-bits";
import { Page } from "@/components/ui-bits";
import { readDraft } from "@/lib/circle";
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
  return (
    <Page title="Invite" back={`/groups/draft/${draft.id}`}>
      <GroupLead src="/marks/invite.png" title={draft.code || "No code yet"} body={`Share this with people you want in ${draft.name}. They type the code or scan the QR.`} />
      <section className="mt-5 rounded-3xl border border-border bg-card p-5">
        <Image src={qr} alt={`QR code for ${draft.name}`} width={224} height={224} unoptimized className="mx-auto size-56" />
        <p className="mt-4 break-all text-center text-sm leading-relaxed">{link}</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <CopyButton value={draft.code} label="Copy code" />
          <CopyButton value={link} label="Copy link" />
          <ShareLink url={link} />
        </div>
      </section>
      <Link href={`/groups/draft/${draft.id}`} className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
        Done
      </Link>
    </Page>
  );
}
