import type { Metadata } from "next";
import { ReceivePageView } from "@/components/receive/receive-page";
import { resolveReceiveIdentifier } from "@/lib/receive-resolve";
import { signedInViewer } from "@/lib/session";

type Params = { identifier: string };
type Search = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { identifier } = await params;
  const resolved = await resolveReceiveIdentifier(identifier).catch(() => null);
  if (!resolved || resolved.status === "invalid" || resolved.status === "not_found") {
    return { title: "Receive · Rvess", description: "Contribute on Rvess with a stream or a one-time gift." };
  }
  const name = resolved.profile.name;
  return {
    title: `${name} · Receive · Rvess`,
    description: resolved.config.description || `Support ${name} on Rvess with a stream or a one-time contribution.`,
  };
}

export default async function PublicReceivePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { identifier } = await params;
  const query = await searchParams;
  const ok = typeof query.ok === "string" && (query.ok === "once" || query.ok === "stream") ? query.ok : null;
  const viewer = await signedInViewer();
  const resolved = await resolveReceiveIdentifier(identifier);

  if (resolved.status === "invalid" || resolved.status === "not_found") {
    return <ReceivePageView identifier={identifier} status={resolved.status} reason={resolved.reason} viewerAddress={viewer?.address} />;
  }

  if (resolved.status === "disabled") {
    return (
      <ReceivePageView
        identifier={identifier}
        status="disabled"
        reason={resolved.reason}
        profile={resolved.profile}
        config={resolved.config}
        payTo={resolved.profile.address}
        viewerAddress={viewer?.address}
      />
    );
  }

  return (
    <ReceivePageView
      identifier={identifier}
      status="ok"
      profile={resolved.profile}
      config={resolved.config}
      funding={resolved.funding}
      payTo={resolved.payTo}
      viewerAddress={viewer?.address}
      success={ok}
    />
  );
}
