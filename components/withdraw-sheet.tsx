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

export function WithdrawSheet({ savings, unit, conceal = false }: { savings: SavingBox[]; unit: string; conceal?: boolean }) {
  return (
    <SlideSheet label="Withdraw" className={withdrawButton} title="Withdraw" description="Choose a saving. Each one has its own withdraw.">
      {(close) =>
        savings.length === 0 ? (
          <div className="px-1 pb-2 text-center">
            <img src="/marks/saving.png" alt="" className="mx-auto size-24 object-contain" />
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">No savings yet. Open a goal, then withdraw from that saving.</p>
            <Link href="/goals/new" onClick={close} className="mt-4 flex h-12 items-center justify-center rounded-full bg-[#D4F06B] text-sm font-semibold text-[#141414]">
              Create a saving
            </Link>
          </div>
        ) : (
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
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
        )
      }
    </SlideSheet>
  );
}

export function topUpMethods(network: string) {
  return [
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
