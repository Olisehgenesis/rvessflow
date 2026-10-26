"use client";

import { useEffect, useRef, useState } from "react";
import { previewPay, previewReceive } from "@/lib/actions";
import type { PayAsset, ReceiveAsset } from "@/lib/pay-math";

export type PayChoice = {
  pay: PayAsset;
  label: string;
  balance: string;
  usd: string;
};

type Line = { label: string; value: string };

const inputClass = "h-12 w-full rounded-2xl border border-border bg-white px-4 text-base outline-none";

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

function ChoiceButton({
  selected,
  label,
  balance,
  usd,
  onClick,
}: {
  selected: boolean;
  label: string;
  balance: string;
  usd: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-2xl border px-2 py-2 text-left ${selected ? "border-foreground bg-white" : "border-border bg-card"}`}
    >
      <span className="block text-sm font-medium">{label}</span>
      <span className="block text-xs text-muted-foreground tabular-nums">{balance}</span>
      <span className="block text-xs tabular-nums">${usd}</span>
    </button>
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
}: {
  choices: PayChoice[];
  mode: "vault" | "wallet" | "stream";
  duration?: number;
  fixedSuper?: string;
  protocolOnTop?: boolean;
  full?: boolean;
  onAmount?: (usd: string) => void;
}) {
  const [pay, setPay] = useState<PayAsset>("usdc");
  const [usd, setUsd] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState("");
  const ticket = useRef(0);

  useEffect(() => {
    const mine = ++ticket.current;
    const hasAmount = Boolean(fixedSuper && fixedSuper !== "0") || Boolean(usd.trim());
    if (!hasAmount) return;
    const handle = setTimeout(() => {
      void previewPay({
        pay,
        usd: fixedSuper ? undefined : usd,
        superWei: fixedSuper,
        mode,
        duration,
        protocolOnTop,
        full,
      }).then((result) => {
        if (mine !== ticket.current) return;
        setLines(result.lines);
        setError(result.error ?? "");
      });
    }, 350);
    return () => clearTimeout(handle);
  }, [pay, usd, duration, fixedSuper, mode, protocolOnTop, full]);

  return (
    <div className="space-y-3">
      <input type="hidden" name="pay" value={pay} />
      <div>
        <p className="mb-1.5 text-sm font-medium">Pay with</p>
        <div className="grid grid-cols-3 gap-2">
          {choices.map((choice) => (
            <ChoiceButton
              key={choice.pay}
              selected={pay === choice.pay}
              label={choice.label}
              balance={choice.balance}
              usd={choice.usd}
              onClick={() => setPay(choice.pay)}
            />
          ))}
        </div>
      </div>
      {fixedSuper ? null : (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Amount in USD</span>
          <input
            name="amount"
            value={usd}
            inputMode="decimal"
            placeholder="100.00"
            className={inputClass}
            required
            onChange={(event) => {
              setUsd(event.target.value);
              onAmount?.(event.target.value);
            }}
          />
        </label>
      )}
      <QuoteList lines={lines} error={error} />
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
  const [error, setError] = useState("");
  const ticket = useRef(0);

  useEffect(() => {
    const mine = ++ticket.current;
    if (!usd.trim()) return;
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
