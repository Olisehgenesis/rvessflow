"use client";

import { useEffect, useRef, useState } from "react";
import { IconCheck, IconChevron } from "@/components/icons";
import { TokenIcon } from "@/components/token-icon";
import Link from "next/link";
import { previewPay, previewReceive } from "@/lib/actions";
import { groupNetLabel, netFromLabel, type GroupNet } from "@/lib/group-network";
import { networkLabel } from "@/lib/network";
import type { PayAsset, ReceiveAsset } from "@/lib/pay-math";

export type PayChoice = {
  pay: PayAsset;
  label: string;
  balance: string;
  usd: string;
  /** Spendable dollar value of this token, floored to a USD input. */
  maxUsd?: string;
  network?: string;
  id?: string;
};

type Line = { label: string; value: string };

const inputClass = "h-12 w-full rounded-2xl border border-border bg-white px-4 text-base outline-none";

/** Keep a quote error on screen for 10 seconds. A newer error replaces it at once. */
function useHeldError() {
  const [error, setShown] = useState("");
  const until = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  function setError(next: string) {
    clearTimeout(timer.current);
    if (next) {
      setShown(next);
      until.current = Date.now() + 10_000;
      timer.current = setTimeout(() => setShown(""), 10_000);
      return;
    }
    const wait = until.current - Date.now();
    if (wait > 0) {
      timer.current = setTimeout(() => setShown(""), wait);
      return;
    }
    setShown("");
  }
  return [error, setError] as const;
}

function QuoteList({ lines, error }: { lines: Line[]; error: string }) {
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!lines.length) return null;
  return (
    <dl className="rounded-2xl bg-muted px-4 py-3 text-sm">
      {lines.map((line) => (
        <div key={line.label} className="flex items-start justify-between gap-3 py-1">
          <dt className="text-muted-foreground">{line.label}</dt>
          <dd className="text-right font-medium tabular-nums">{line.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function moneyOf(value: string) {
  const amount = Number(value.replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function choiceId(choice: PayChoice) {
  return choice.id || `${choice.network ?? ""}-${choice.pay}`;
}

function richest(choices: PayChoice[]): PayChoice | undefined {
  const ranked = choices.reduce<PayChoice | undefined>((best, choice) => {
    if (!best || moneyOf(choice.usd) > moneyOf(best.usd)) return choice;
    return best;
  }, undefined);
  if (ranked && moneyOf(ranked.usd) > 0) return ranked;
  return choices.find((choice) => netFromLabel(choice.network) === "celo" && choice.pay === "usdcx") ?? choices[0];
}

function capOf(choice: PayChoice | undefined) {
  return moneyOf(choice?.maxUsd || choice?.usd || "0");
}

function shareOf(usd: string, cap: number) {
  if (!(cap > 0)) return 0;
  const share = Math.round((moneyOf(usd) / cap) * 100);
  return Math.min(100, Math.max(0, share));
}

function dollars(cap: number, share: number) {
  if (!(cap > 0) || share <= 0) return "";
  return ((cap * share) / 100).toFixed(2);
}

function AmountShare({
  cap,
  usd,
  onUsd,
}: {
  cap: number;
  usd: string;
  onUsd: (value: string) => void;
}) {
  const share = shareOf(usd, cap);
  const open = cap > 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Amount in USD</span>
        <span className="text-sm font-semibold tabular-nums">{open ? `${share}%` : "0%"}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={open ? share : 0}
        disabled={!open}
        aria-label="Share of the selected token"
        onChange={(event) => onUsd(dollars(cap, Number(event.target.value)))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#E7EDE0] accent-[#141414] disabled:cursor-not-allowed disabled:opacity-40"
      />
      <input
        name="amount"
        aria-label="Amount in USD"
        value={usd}
        inputMode="decimal"
        placeholder={open ? dollars(cap, 100) : "0.00"}
        className={inputClass}
        required
        onChange={(event) => onUsd(event.target.value)}
      />
    </div>
  );
}

function TokenSelect({ choices, value, onChange }: { choices: PayChoice[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const picked = choices.find((choice) => choiceId(choice) === value) ?? choices[0];
  if (!picked) return <p className="text-sm text-muted-foreground">No token is available in this wallet.</p>;
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
        className="flex h-14 w-full items-center gap-3 rounded-2xl border border-border bg-white px-3 text-left"
      >
        <TokenIcon symbol={picked.label} network={picked.network ?? networkLabel()} className="size-8" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{picked.label}</span>
          <span className="block text-xs text-muted-foreground tabular-nums">
            {picked.network ? `${picked.network} · ` : ""}
            {picked.balance} available
          </span>
        </span>
        <span className="text-sm font-medium tabular-nums">${picked.usd}</span>
        <IconChevron className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>
      {open ? (
        <ul role="listbox" aria-label="Pay with" className="mt-2 overflow-hidden rounded-2xl border border-border bg-white">
          {choices.map((choice) => {
            const selected = choiceId(choice) === choiceId(picked);
            return (
              <li key={choiceId(choice)}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(choiceId(choice));
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${selected ? "bg-[#F4F8E8]" : ""}`}
                >
                  <TokenIcon symbol={choice.label} network={choice.network ?? networkLabel()} className="size-8" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{choice.label}</span>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {choice.network ? `${choice.network} · ` : ""}
                      {choice.balance} available
                    </span>
                  </span>
                  <span className="text-sm font-medium tabular-nums">${choice.usd}</span>
                  {selected ? <IconCheck className="size-4 text-[#141414]" /> : <span className="size-4" />}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function PayWith({
  choices,
  mode,
  duration,
  fixedSuper,
  protocolOnTop,
  full,
  onAmount,
  stayOn,
  onBlocked,
}: {
  choices: PayChoice[];
  mode: "vault" | "wallet" | "stream";
  duration?: number;
  fixedSuper?: string;
  protocolOnTop?: boolean;
  full?: boolean;
  onAmount?: (usd: string) => void;
  /** When set, a token on the other chain asks the user to swap instead of paying. */
  stayOn?: GroupNet;
  onBlocked?: (blocked: boolean) => void;
}) {
  const start = richest(choices);
  const [pickedId, setPickedId] = useState(() => (start ? choiceId(start) : ""));
  const [usd, setUsd] = useState("");
  const [share, setShare] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useHeldError();
  const ticket = useRef(0);
  const picked = choices.find((choice) => choiceId(choice) === pickedId) ?? start;
  const tokenNet = netFromLabel(picked?.network);
  const swap = Boolean(stayOn && picked && tokenNet !== stayOn);

  useEffect(() => {
    onBlocked?.(swap);
  }, [swap, onBlocked]);

  useEffect(() => {
    const mine = ++ticket.current;
    if (swap) {
      setLines([]);
      setError("");
      return;
    }
    const hasAmount = Boolean(fixedSuper && fixedSuper !== "0") || Boolean(usd.trim());
    if (!hasAmount) {
      setError("");
      return;
    }
    const handle = setTimeout(() => {
      void previewPay({
        pay: picked?.pay ?? "usdc",
        usd: fixedSuper ? undefined : usd,
        superWei: fixedSuper,
        mode,
        duration,
        protocolOnTop,
        full,
        network: picked?.network,
      }).then((result) => {
        if (mine !== ticket.current) return;
        setLines(result.lines);
        setError(result.error ?? "");
      });
    }, 350);
    return () => clearTimeout(handle);
  }, [pickedId, usd, duration, fixedSuper, mode, protocolOnTop, full, swap, picked?.pay, picked?.network]);

  const cap = capOf(picked);

  function writeUsd(next: string) {
    setUsd(next);
    setShare(shareOf(next, cap));
    onAmount?.(next);
  }

  function choose(id: string) {
    const next = choices.find((choice) => choiceId(choice) === id);
    const amount = dollars(capOf(next), share);
    setPickedId(id);
    setUsd(amount);
    onAmount?.(amount);
  }

  const here = stayOn ? groupNetLabel(stayOn) : "";
  const there = picked?.network || groupNetLabel(tokenNet);

  return (
    <div className="space-y-3">
      <input type="hidden" name="pay" value={picked?.pay ?? ""} />
      <input type="hidden" name="network" value={tokenNet} />
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Pay with</p>
        <TokenSelect choices={choices} value={picked ? choiceId(picked) : ""} onChange={choose} />
      </div>
      {swap ? (
        <div className="rounded-2xl bg-muted px-4 py-3 text-sm leading-relaxed">
          <p>
            This is on {here}. You picked a {there} token. Swap it to a {here} dollar, then come back to top up.
          </p>
          <Link href="/home/send" className="mt-2 inline-block font-medium underline">
            Swap or send
          </Link>
        </div>
      ) : null}
      {swap || fixedSuper ? null : <AmountShare cap={cap} usd={usd} onUsd={writeUsd} />}
      {swap ? null : <QuoteList lines={lines} error={error} />}
    </div>
  );
}

const receiveChoices: { receive: ReceiveAsset; label: string }[] = [
  { receive: "usdc", label: "USDC" },
  { receive: "usdt", label: "USDT" },
  { receive: "eth", label: "ETH" },
];

export function ReceiveWith() {
  const [receive, setReceive] = useState<ReceiveAsset>("usdc");
  const [usd, setUsd] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useHeldError();
  const ticket = useRef(0);

  useEffect(() => {
    const mine = ++ticket.current;
    if (!usd.trim()) {
      setError("");
      return;
    }
    const handle = setTimeout(() => {
      void previewReceive({ usd, receive }).then((result) => {
        if (mine !== ticket.current) return;
        setLines(result.lines);
        setError(result.error ?? "");
      });
    }, 350);
    return () => clearTimeout(handle);
  }, [usd, receive]);

  return (
    <div className="space-y-3">
      <input type="hidden" name="receive" value={receive} />
      <div>
        <p className="mb-1.5 text-sm font-medium">Receive</p>
        <div className="grid grid-cols-3 gap-2">
          {receiveChoices.map((choice) => (
            <button
              key={choice.receive}
              type="button"
              aria-pressed={receive === choice.receive}
              onClick={() => setReceive(choice.receive)}
              className={`h-11 rounded-2xl border text-sm font-medium ${receive === choice.receive ? "border-foreground bg-white" : "border-border bg-card"}`}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Amount in USD</span>
        <input
          name="amount"
          value={usd}
          inputMode="decimal"
          placeholder="25.00"
          className={inputClass}
          required
          onChange={(event) => setUsd(event.target.value)}
        />
      </label>
      <QuoteList lines={lines} error={error} />
    </div>
  );
}
