"use client";

import { useState } from "react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { GdxSwap } from "@/components/gdx-swap";
import { TokenIcon } from "@/components/token-icon";
import { PrivateLine, PrivateUsd } from "@/components/private-money";
import type { HoldingRow } from "@/lib/holding-row";
import { canSwapToken, gdxViaFromRow, sendAssetForKey, type GdxTradeBalances } from "@/lib/token-face";

export function TokenSheet({
  row,
  open,
  onOpen,
  localUnit,
  trade,
}: {
  row: HoldingRow;
  open: boolean;
  onOpen: (open: boolean) => void;
  localUnit?: string;
  trade?: GdxTradeBalances;
}) {
  const [swap, setSwap] = useState(false);
  const send = sendAssetForKey(row.key);
  const via = gdxViaFromRow(row);
  const showSwap = Boolean(trade && canSwapToken(row));
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) setSwap(false);
        onOpen(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-[#141414]/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Content className="fixed right-0 bottom-0 left-0 z-[61] max-h-[88vh] overflow-y-auto rounded-t-[1.75rem] bg-white px-5 pt-4 pb-8 shadow-[0_-24px_80px_-28px_rgba(20,20,20,0.45)] outline-none sm:top-1/2 sm:right-auto sm:bottom-auto sm:left-1/2 sm:w-[min(100%-1.5rem,24rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[1.5rem] sm:pb-5">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border sm:hidden" />
          <div className="flex justify-center">
            <TokenIcon symbol={row.label} network={row.network} className="size-16" />
          </div>
          <Dialog.Title className="mt-3 text-center text-lg font-semibold tracking-[-0.03em]">{row.label}</Dialog.Title>
          <Dialog.Description className="mt-1 text-center text-sm text-muted-foreground">{row.network}</Dialog.Description>
          <p className="mt-3 text-center text-xl font-semibold tabular-nums">
            {row.local && localUnit ? <PrivateLine value={`${localUnit} ${row.local}`} /> : <PrivateUsd value={row.usd} />}
          </p>
          <p className="mt-0.5 text-center text-sm text-muted-foreground">
            <PrivateLine value={`${row.amount} ${row.label}`} />
          </p>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {send ? (
              <Link
                href={`/home/send/address?asset=${encodeURIComponent(send)}`}
                className="flex h-11 items-center justify-center rounded-full border border-border text-sm font-medium"
              >
                Send
              </Link>
            ) : (
              <span className="flex h-11 items-center justify-center rounded-full border border-border text-sm text-muted-foreground">Send</span>
            )}
            <Link href="/home/add/receive" className="flex h-11 items-center justify-center rounded-full border border-border text-sm font-medium">
              Receive
            </Link>
            {showSwap ? (
              <button
                type="button"
                aria-pressed={swap}
                onClick={() => setSwap((current) => !current)}
                className={`flex h-11 items-center justify-center rounded-full text-sm font-medium ${swap ? "bg-[#D4F06B] text-[#141414]" : "border border-border"}`}
              >
                Swap
              </button>
            ) : (
              <span className="flex h-11 items-center justify-center rounded-full border border-border text-sm text-muted-foreground">Swap</span>
            )}
          </div>
          {swap && trade ? (
            <div className="mt-5">
              <GdxSwap trade={trade} initialVia={via ?? "usdm"} initialSide={row.key === "celo-gooddollar" ? "sell" : "buy"} />
            </div>
          ) : null}
          <Dialog.Close className="mt-4 flex h-11 w-full items-center justify-center rounded-full text-sm font-medium text-[#5C6572]">
            Close
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
