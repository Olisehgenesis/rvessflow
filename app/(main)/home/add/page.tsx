import Link from "next/link";
import { Suspense } from "react";
import Loading from "../../loading";
import { FlowHeader } from "@/components/deposit-flow";
import { IconChevron } from "@/components/icons";

const methods = [
  { href: "/home/add/crypto", title: "Convert crypto", detail: "USDC, USDT, or ETH already on Base." },
  { href: "/home/add/receive", title: "Receive from a wallet", detail: "Show your Base address and a QR code." },
  { href: "/home/add/mobile", title: "Top up with mobile money", detail: "MTN MoMo or Airtel Money in Uganda." },
  { href: "/home/add/card", title: "Buy with card", detail: "Transak or Coinbase. USDC arrives on Base." },
];

export default function AddMoneyPage() {
  return (
    <Suspense fallback={<Loading />}>
      <main className="px-4 pt-4 pb-8">
        <FlowHeader title="Add money" back="/home" />
        <p className="mb-4 text-sm text-muted-foreground">Choose how USD reaches your vault.</p>
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
        <Link href="/home/add/withdraw" className="mt-6 block text-center text-sm font-medium text-muted-foreground">
          Withdraw instead
        </Link>
      </main>
    </Suspense>
  );
}
