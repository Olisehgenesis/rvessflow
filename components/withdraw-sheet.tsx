"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { IconChevron, IconClose } from "@/components/icons";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const withdrawButton = "flex h-12 items-center justify-center rounded-full border border-[#141414]/15 bg-white/70 text-sm font-semibold";

export type SavingBox = {
  id: string;
  name: string;
  saved: string;
  goal: string;
  progress: number;
};

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

export type WalletSource = { label: string; amount: string; href: string };

export function WithdrawSheet({
  savings,
  unit,
  conceal = false,
  idleUsd = "0.00",
  wallet = [],
}: {
  savings: SavingBox[];
  unit: string;
  conceal?: boolean;
  idleUsd?: string;
  wallet?: WalletSource[];
}) {
  return (
    <SlideSheet label="Withdraw" className={withdrawButton} title="Withdraw" description="Choose where the money is.">
      {(close) => (
        <div className="max-h-[60vh] space-y-5 overflow-y-auto px-1 pb-2">
          <section>
            <h3 className="text-sm font-semibold">In this wallet</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Sending to another address is not available. You can move a token into the vault, then withdraw the idle balance.
            </p>
            {wallet.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No tokens in this wallet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {wallet.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} onClick={close} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">Move {item.label} into the vault</span>
                        <span className="block text-xs text-muted-foreground tabular-nums">{conceal ? "••••" : item.amount}</span>
                      </span>
                      <IconChevron className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3 className="text-sm font-semibold">Idle in the vault</h3>
            <Link href="/home/add/withdraw" onClick={close} className="mt-2 flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Withdraw idle {unit}</span>
                <span className="block text-xs text-muted-foreground tabular-nums">{conceal ? "••••" : idleUsd ? `${unit} ${idleUsd}` : "Amount unavailable"}</span>
              </span>
              <IconChevron className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </section>
          <section>
            <h3 className="text-sm font-semibold">Savings</h3>
            {savings.length === 0 ? (
              <div className="mt-2">
                <p className="text-sm leading-relaxed text-muted-foreground">No savings yet. A saving can be withdrawn from its own page.</p>
                <Link href="/goals/new" onClick={close} className="mt-3 inline-flex text-sm font-semibold">
                  Create a saving
                </Link>
              </div>
            ) : (
              <ul className="mt-2 space-y-2">
                {savings.map((saving) => (
                  <li key={saving.id}>
                    <Link href={`/goals/${saving.id}`} onClick={close} className="block rounded-2xl border border-border bg-card p-3">
                      <span className="flex items-center gap-3">
                        <img src="/marks/saving.png" alt="" className="size-11 shrink-0 object-contain" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{saving.name}</span>
                          <span className="block text-xs text-muted-foreground tabular-nums">
                            {conceal ? "••••" : `${unit} ${saving.saved}`}
                            <span> / {conceal ? "••••" : `${unit} ${saving.goal}`}</span>
                          </span>
                        </span>
                        <IconChevron className="size-4 shrink-0 text-muted-foreground" />
                      </span>
                      <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-foreground" style={{ width: `${saving.progress}%` }} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </SlideSheet>
  );
}

export function topUpMethods(network: string) {
  return [
    { href: "/home/add/receive", title: "Receive", body: "Show your address and a QR code.", src: "/marks/receive.png" },
    { href: "/home/add/crypto", title: "Convert", body: "Move USDC, USDT, or ETH you already hold into the vault.", src: "/marks/crypto.png" },
    { href: "/home/add/card", title: "Card", body: `Transak or Coinbase. USDC arrives on ${network}.`, src: "/marks/card.png" },
    { href: "/home/add/mobile", title: "Mobile money", body: "MTN MoMo or Airtel Money in Uganda.", src: "/marks/phone.png" },
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
