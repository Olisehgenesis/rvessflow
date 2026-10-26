import Link from "next/link";
import { Suspense } from "react";
import Loading from "../../loading";
import { FlowHeader } from "@/components/deposit-flow";
import { IconChevron } from "@/components/icons";

const methods = [
  { href: "/home/add/receive", title: "Receive crypto", detail: "Your Base address and a QR code. USDC, USDT, or ETH on Base only." },
  { href: "/home/add/crypto", title: "Convert crypto you hold", detail: "USDC, USDT, or ETH on Base, swapped if needed, then wrapped into the vault." },
  { href: "/home/add/card", title: "Buy with card", detail: "Transak or Coinbase Onramp. If a key is missing, that provider says it is unavailable." },
  { href: "/home/add/mobile", title: "Mobile money", detail: "Uganda MTN MoMo or Airtel Money through Kotani Pay. Unavailable until Kotani is configured." },
];

export default function AddMoneyPage() {
  return (
    <Suspense fallback={<Loading />}>
      <main className="px-4 pt-4 pb-8">
        <FlowHeader title="Top up" back="/home" />
        <h2 className="text-lg font-semibold">Choose how to fund your wallet</h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">Every option opens a real flow on Base mainnet. A provider without keys stays on its screen and says what is missing.</p>
        <div className="space-y-2">
          {methods.map((method) => (
            <Link key={method.href} href={method.href} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{method.title}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{method.detail}</span>
              </span>
              <IconChevron className="size-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
        <p className="mt-4 rounded-2xl border border-border bg-card px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          These contracts are unaudited. Add only what you can afford to lose. Assets sent on a network other than Base can be lost.
        </p>
        <Link href="/home/add/withdraw" className="mt-4 block text-center text-sm font-medium text-muted-foreground">
          Withdraw instead
        </Link>
      </main>
    </Suspense>
  );
}
