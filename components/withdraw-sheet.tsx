"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { IconChevron, IconClose } from "@/components/icons";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const withdrawButton = "flex h-12 items-center justify-center rounded-full border border-[#141414]/15 bg-white/70 text-sm font-semibold";

function hasIdle(value: string) {
  const amount = Number(value.replace(/,/g, ""));
  return Number.isFinite(amount) && amount > 0;
}

function SlideSheet({
  label,
  className,
  title,
  description,
  children,
}: {
  label: string;
  className: string;
  title: string;
  description: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      <SheetContent side="bottom" showCloseButton={false} className="mx-auto w-full max-w-lg rounded-t-3xl border-0 px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-[#E3E8DC]" />
        <div className="flex items-start justify-between gap-3 px-1 pb-2">
          <SheetHeader className="p-0">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <SheetClose aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-full text-foreground">
            <IconClose className="size-5" />
          </SheetClose>
        </div>
        {children(() => setOpen(false))}
      </SheetContent>
    </Sheet>
  );
}

export function WithdrawSheet({ idleUsd = "0.00" }: { idleUsd?: string }) {
  const saved = hasIdle(idleUsd);
  return (
    <SlideSheet label="Withdraw" className={withdrawButton} title="Withdraw" description="Choose where the money goes.">
      {(close) => (
        <ul className="space-y-2">
          {saved ? (
            <Choice href="/home/add/withdraw" title="To your available balance" body={`Move $${idleUsd} of saved USD into this wallet.`} src="/marks/saving.png" onPick={close} />
          ) : null}
          <Choice title="To another address" body="Send USDC, USDT, or ETH on Base." src="/marks/address.png" />
          <Choice title="To a friend" body="Someone already on this device." src="/marks/friend.png" />
          <Choice title="To mobile money" body="Not available yet." src="/marks/phone.png" quiet />
          <Choice title="To a bank account" body="Not available yet." src="/marks/bank.png" quiet />
        </ul>
      )}
    </SlideSheet>
  );
}

export function topUpMethods(network: string) {
  return [
    { href: "/home/add/crypto", title: "Convert crypto", body: `USDC, USDT, or ETH already on ${network}.`, src: "/marks/crypto.png" },
    { href: "/home/add/receive", title: "Receive", body: "Show your address and a QR code.", src: "/marks/receive.png" },
    { href: "/home/add/mobile", title: "Mobile money", body: "MTN MoMo or Airtel Money in Uganda.", src: "/marks/phone.png" },
    { href: "/home/add/card", title: "Card", body: `Transak or Coinbase. USDC arrives on ${network}.`, src: "/marks/card.png" },
  ];
}

export function TopUpList({ network = "Base", onPick }: { network?: string; onPick?: () => void }) {
  return (
    <ul className="space-y-2">
      {topUpMethods(network).map((method) => (
        <Choice key={method.href} {...method} onPick={onPick} />
      ))}
    </ul>
  );
}

export function TopUpSheet({ network = "Base", className }: { network?: string; className: string }) {
  return (
    <SlideSheet label="Top up" className={className} title="Top up" description="Choose how money comes in.">
      {(close) => <TopUpList network={network} onPick={close} />}
    </SlideSheet>
  );
}

function Choice({
  title,
  body,
  src,
  quiet = false,
  href,
  onPick,
}: {
  title: string;
  body: string;
  src: string;
  quiet?: boolean;
  href?: string;
  onPick?: () => void;
}) {
  const row = (
    <>
      <img src={src} alt="" className="size-11 shrink-0 object-contain" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{body}</span>
      </span>
      {href ? <IconChevron className="size-4 shrink-0 text-muted-foreground" /> : null}
    </>
  );
  const className = `flex items-center gap-3 rounded-2xl px-2 py-2.5 ${quiet ? "opacity-60" : ""}`;
  return <li>{href ? <Link href={href} className={className} onClick={onPick}>{row}</Link> : <div className={className}>{row}</div>}</li>;
}
