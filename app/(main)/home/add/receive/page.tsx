import Image from "next/image";
import QRCode from "qrcode";
import { Suspense } from "react";
import Loading from "../../../loading";
import { CopyButton } from "@/components/copy-button";
import { FlowHeader } from "@/components/deposit-flow";
import { IconInfo } from "@/components/icons";
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
  const qr = await QRCode.toDataURL(who.address, {
    margin: 1,
    width: 280,
    color: { dark: "#0b0f14", light: "#ffffff" },
  });
  return (
    <main className="px-4 pt-4 pb-8">
      <FlowHeader title="Receive" back="/home/add" />
      <p className="text-sm text-muted-foreground">Send USDC, USDT, or ETH on Base to this address. It lands in your wallet. Convert crypto afterwards to move it into the vault.</p>
      <section className="mt-5 rounded-3xl border border-border bg-card p-5">
        <Image src={qr} alt="QR code for your Base address" width={224} height={224} unoptimized className="mx-auto size-56" />
        <p className="mt-4 break-all text-center font-mono text-sm leading-relaxed">{who.address}</p>
        <div className="mt-2 flex justify-center">
          <CopyButton value={who.address} label="Copy address" />
        </div>
      </section>
      <p className="mt-4 flex gap-2 rounded-2xl bg-[#f3f0e6] px-4 py-3 text-sm leading-relaxed">
        <IconInfo className="mt-0.5 size-4 shrink-0" />
        Base only. Send USDC, USDT, or ETH on Base. Funds sent on another network can be lost.
      </p>
    </main>
  );
}
