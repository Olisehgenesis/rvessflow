import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { Suspense } from "react";
import Loading from "../../../loading";
import { CopyButton } from "@/components/copy-button";
import { FlowHeader } from "@/components/deposit-flow";
import { IconInfo } from "@/components/icons";
import { ReceiveWatch } from "@/components/receive-watch";
import { ReceiveTokens } from "@/components/receive-tokens";
import { contactOf } from "@/lib/circle";
import { viewer } from "@/lib/session";

export default function ReceivePage() {
  return (
    <Suspense fallback={<Loading />}>
      <ReceiveBody />
    </Suspense>
  );
}

async function ReceiveBody() {
  const who = await viewer();
  const contact = await contactOf(who.address).catch(() => null);
  const host = (await headers()).get("x-forwarded-host") || (await headers()).get("host") || "rvess.xyz";
  const proto = (await headers()).get("x-forwarded-proto") || "https";
  const slug = contact?.memberCode || who.address;
  const publicLink = `${proto}://${host}/r/${slug}`;
  const linkQr = await QRCode.toDataURL(publicLink, {
    margin: 1,
    width: 280,
    color: { dark: "#0b0f14", light: "#ffffff" },
  });
  const addressQr = await QRCode.toDataURL(who.address, {
    margin: 1,
    width: 280,
    color: { dark: "#0b0f14", light: "#ffffff" },
  });
  return (
    <main className="px-4 pb-8">
      <FlowHeader title="Receive" back="/home/add" />
      <p className="text-sm text-muted-foreground">Share a receive page for Give once or Stream, or show your wallet address for a direct transfer. Same address on Base and Celo. G$ is on Celo.</p>
      <section className="mt-4 rounded-3xl border border-border bg-card p-5">
        <p className="text-sm font-semibold">Public receive link</p>
        <p className="mt-1 text-sm text-muted-foreground">Scan to open your Give once / Stream page. Anyone can contribute without signing into your account.</p>
        <Image src={linkQr} alt="QR code for your public receive link" width={224} height={224} unoptimized className="mx-auto mt-4 size-56" />
        <p className="mt-4 break-all text-center font-mono text-xs leading-relaxed">{publicLink}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <CopyButton value={publicLink} label="Copy link" />
          <Link href={`/r/${encodeURIComponent(slug)}`} className="inline-flex h-9 items-center rounded-full border border-border px-3 text-sm font-medium">
            Open page
          </Link>
          <Link href="/settings/receive" className="inline-flex h-9 items-center rounded-full border border-border px-3 text-sm font-medium">
            Configure
          </Link>
        </div>
      </section>
      <ReceiveTokens />
      <section className="mt-5 rounded-3xl border border-border bg-card p-5">
        <p className="mb-1 text-center text-sm font-semibold">Wallet address</p>
        <p className="mb-3 text-center text-xs text-muted-foreground">For wallets that send straight to an address</p>
        <Image src={addressQr} alt="QR code for this address" width={224} height={224} unoptimized className="mx-auto size-56" />
        <p className="mt-4 break-all text-center font-mono text-sm leading-relaxed">{who.address}</p>
        <div className="mt-2 flex justify-center">
          <CopyButton value={who.address} label="Copy address" />
        </div>
      </section>
      <div className="mt-4">
        <ReceiveWatch />
      </div>
      <p className="mt-4 flex gap-2 rounded-2xl bg-[#f3f0e6] px-4 py-3 text-sm leading-relaxed">
        <IconInfo className="mt-0.5 size-4 shrink-0" />
        Base and Celo only. A transfer on any other network can be lost.
      </p>
    </main>
  );
}
