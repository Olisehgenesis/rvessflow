"use client";

import { useState } from "react";
import { continueIntent, sendFunds } from "@/lib/actions";
import { sendCalls } from "@/lib/client-sign";
import type { FonbnkField, FonbnkKyc } from "@/lib/fonbnk-api";

const primary = "flex h-12 w-full items-center justify-center rounded-full bg-[#D4F06B] text-base font-medium text-[#141414] disabled:opacity-50";
const field = "mt-1 h-12 w-full rounded-2xl border border-border bg-card px-4 text-base outline-none";

function usdtAmount(value: string) {
  const [whole, frac = ""] = value.replace(/,/g, "").split(".");
  return frac ? `${whole}.${frac.slice(0, 6)}` : whole;
}

export function FonbnkCashOut({
  unit,
  place,
  email: startEmail,
  phone: startPhone,
}: {
  unit: string;
  place: string;
  email: string;
  phone: string;
}) {
  const [email, setEmail] = useState(startEmail);
  const [phone, setPhone] = useState(startPhone);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [quote, setQuote] = useState<{
    quoteId: string;
    sendUsdt: string;
    receiveLocal: string;
    channel: string;
    fields: FonbnkField[];
    kyc: FonbnkKyc;
  } | null>(null);
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<{ orderId: string; to: string; amount: string; text: string } | null>(null);
  const [done, setDone] = useState("");

  async function quoteOut() {
    if (!amount) {
      setError(`Enter how much in ${unit}.`);
      return;
    }
    if (!email.trim()) {
      setError("Fonbnk needs an email for this person.");
      return;
    }
    setPending(true);
    setError("");
    setOrder(null);
    setDone("");
    try {
      const response = await fetch("/api/onramp/mobile/offramp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "quote", amount, email }),
      });
      const payload = (await response.json()) as typeof quote & { error?: string };
      if (!response.ok || !payload?.quoteId) throw new Error(payload?.error || "Fonbnk did not quote.");
      setQuote(payload);
      const next: Record<string, string> = {};
      for (const item of payload.fields) {
        if (item.key === "phoneNumber" && phone) next.phoneNumber = phone;
        if (item.key === "blockchainWalletAddress") continue;
      }
      setExtra(next);
    } catch (caught) {
      setQuote(null);
      setError(caught instanceof Error ? caught.message : "Fonbnk did not quote.");
    } finally {
      setPending(false);
    }
  }

  async function createOrder() {
    if (!quote) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/onramp/mobile/offramp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "order",
          amount,
          email,
          quoteId: quote.quoteId,
          channel: quote.channel,
          fields: extra,
        }),
      });
      const payload = (await response.json()) as { orderId?: string; to?: string; amount?: string; text?: string; error?: string };
      if (!response.ok || !payload.orderId || !payload.to || !payload.amount) throw new Error(payload.error || "Fonbnk did not create the order.");
      setOrder({ orderId: payload.orderId, to: payload.to, amount: payload.amount, text: payload.text || "" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Fonbnk did not create the order.");
    } finally {
      setPending(false);
    }
  }

  async function sendUsdt() {
    if (!order) return;
    setPending(true);
    setError("");
    try {
      const data = new FormData();
      data.set("asset", "celo-usdt");
      data.set("to", order.to);
      data.set("amount", usdtAmount(order.amount));
      const state = await sendFunds(null, data);
      if (state?.error) throw new Error(state.error);
      if (!state?.sign) throw new Error("This account could not sign the send.");
      let hash = "";
      await sendCalls(state.sign, {
        onHash: (value) => {
          hash = value;
        },
      });
      if (hash) {
        const confirm = await fetch("/api/onramp/mobile/offramp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "confirm", orderId: order.orderId, hash }),
        });
        const payload = (await confirm.json()) as { error?: string };
        if (!confirm.ok) throw new Error(payload.error || "Fonbnk did not take the hash.");
      }
      const next = await continueIntent(state.sign.intent);
      if (next.error) throw new Error(next.error);
      setDone(hash || "Sent. Fonbnk is paying out.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The passkey send failed.");
    } finally {
      setPending(false);
    }
  }

  const needed = quote?.fields.filter((item) => item.key !== "blockchainWalletAddress") ?? [];
  const missing = needed.filter((item) => item.required && !String(extra[item.key] || (item.key === "phoneNumber" ? phone : "")).trim());

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#5C6572]">{place} · {unit}. Cash out sends Celo USDT from this passkey. Fonbnk does not sign.</p>
      <label className="block text-sm font-medium">
        Email
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="you@example.com" className={field} />
      </label>
      <label className="block text-sm font-medium">
        Amount
        <span className="flex items-end gap-2 border-b border-[#E6EADF] pb-2">
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            placeholder="0"
            className="min-w-0 flex-1 bg-transparent text-[2.2rem] leading-none font-semibold tracking-[-0.05em] tabular-nums outline-none"
          />
          <span className="mb-1 text-sm font-semibold text-[#5C6572]">{unit}</span>
        </span>
      </label>
      <button type="button" onClick={() => void quoteOut()} disabled={pending || !amount} className={primary}>
        {pending && !quote ? "Asking Fonbnk…" : "See USDT to send"}
      </button>
      {quote ? (
        <div className="space-y-3 rounded-[1.4rem] bg-[#F7F6F3] p-4">
          <p className="text-sm leading-relaxed">
            Send <span className="font-semibold tabular-nums">{quote.sendUsdt} USDT</span> on Celo to get about{" "}
            <span className="font-semibold tabular-nums">{quote.receiveLocal} {unit}</span>.
          </p>
          {quote.kyc.message ? <p className="text-sm text-[#5C6572]">{quote.kyc.message}</p> : null}
          {quote.kyc.required ? (
            <div className="space-y-2">
              <p className="text-sm">Fonbnk needs KYC on this email before the order.</p>
              {quote.kyc.url ? (
                <button type="button" onClick={() => window.open(quote.kyc.url, "_blank", "noopener,noreferrer")} className="flex h-11 w-full items-center justify-center rounded-full border border-border text-sm font-medium">
                  Open KYC
                </button>
              ) : (
                <p className="text-sm text-destructive">No KYC link came back. Ask Fonbnk to enable hosted KYC for this merchant.</p>
              )}
            </div>
          ) : null}
          {needed.map((item) =>
            item.options?.length ? (
              <label key={item.key} className="block text-sm font-medium">
                {item.label}
                <select
                  value={extra[item.key] || ""}
                  onChange={(event) => setExtra((current) => ({ ...current, [item.key]: event.target.value }))}
                  className={field}
                >
                  <option value="">Pick one</option>
                  {item.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label key={item.key} className="block text-sm font-medium">
                {item.label}
                <input
                  value={item.key === "phoneNumber" ? extra.phoneNumber || phone : extra[item.key] || ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (item.key === "phoneNumber") setPhone(value);
                    setExtra((current) => ({ ...current, [item.key]: value }));
                  }}
                  className={field}
                />
              </label>
            ),
          )}
          <button type="button" onClick={() => void createOrder()} disabled={pending || quote.kyc.required || missing.length > 0} className={primary}>
            {pending && quote && !order ? "Creating order…" : "Create order"}
          </button>
        </div>
      ) : null}
      {order ? (
        <div className="space-y-3 rounded-[1.4rem] border border-[#E6EADF] p-4">
          <p className="text-sm leading-relaxed">{order.text}</p>
          <p className="break-all font-mono text-xs">{order.to}</p>
          <p className="text-sm font-semibold tabular-nums">{usdtAmount(order.amount)} USDT</p>
          <button type="button" onClick={() => void sendUsdt()} disabled={pending} className={primary}>
            {pending ? "Waiting for passkey…" : "Sign send with passkey"}
          </button>
        </div>
      ) : null}
      {done ? <p className="text-sm text-emerald-700">{done}</p> : null}
      {error ? <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
