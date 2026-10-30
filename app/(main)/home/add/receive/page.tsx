import Image from "next/image";
import QRCode from "qrcode";
import { Suspense } from "react";
import Loading from "../../../loading";
import { CopyButton } from "@/components/copy-button";
import { FlowHeader } from "@/components/deposit-flow";
import { IconInfo } from "@/components/icons";
import { ReceiveWatch } from "@/components/receive-watch";
import { ChainMark } from "@/components/token-icon";
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
    <main className="px-4 pb-8">
      <FlowHeader title="Receive" back="/home/add" />
      <p className="text-sm text-muted-foreground">This address is the same on Base and on Celo. Tokens land in the wallet. Savings, streams, and groups stay on the network this app uses.</p>
      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="flex items-center gap-2 font-medium">
            <ChainMark chain="base" className="size-5" />
            Base
          </dt>
          <dd className="text-muted-foreground">USDC, USDT, USDM, ETH, USDCx, ETHx</dd>
        </div>
        <div>
          <dt className="flex items-center gap-2 font-medium">
            <ChainMark chain="celo" className="size-5" />
            Celo
          </dt>
          <dd className="text-muted-foreground">USDC, USDT, USDm, USDM, CELO, cUSDx, CELOx, G$</dd>
        </div>
      </dl>
      <section className="mt-5 rounded-3xl border border-border bg-card p-5">
        <Image src={qr} alt="QR code for this address" width={224} height={224} unoptimized className="mx-auto size-56" />
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
