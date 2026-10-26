"use client";

import { useState } from "react";
import type { ProviderStatus } from "@/lib/onramp";

const primary = "flex h-12 w-full items-center justify-center rounded-full bg-primary text-base font-medium text-primary-foreground disabled:opacity-50";

function Missing({ status }: { status: ProviderStatus }) {
  if (status.configured) return <p className="text-sm text-emerald-700">Ready. A live request is sent only when you continue.</p>;
  return (
    <div className="rounded-2xl bg-[#f3f0e6] px-4 py-3 text-sm leading-relaxed">
      <p className="font-medium">{status.label} is not configured.</p>
      <p className="mt-1 text-muted-foreground">Add these server environment variables. No payment is sent until they are set.</p>
      <ul className="mt-2 space-y-1 font-mono text-xs">
        {status.missing.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function MobileMoneyForm({ status, address }: { status: ProviderStatus; address: string }) {
  const [network, setNetwork] = useState<"MTN" | "AIRTEL">("MTN");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!status.configured) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/onramp/mobile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network, phone, name, amount }),
      });
      const payload = (await response.json()) as { message?: string; referenceId?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "The request failed.");
      setMessage(payload.referenceId ? `${payload.message} Reference ${payload.referenceId}.` : payload.message || "Approve the prompt on your phone.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The request failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Missing status={status} />
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["MTN", "MTN MoMo"],
            ["AIRTEL", "Airtel Money"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={network === id}
            onClick={() => setNetwork(id)}
            className={`h-12 rounded-2xl text-sm font-medium ${network === id ? "border-2 border-foreground bg-card" : "border border-border bg-card"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="block text-sm font-medium">
        Phone number
        <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" placeholder="0772 123 456" className="mt-1 h-12 w-full rounded-2xl border border-border bg-card px-4 font-normal outline-none" />
      </label>
      <label className="block text-sm font-medium">
        Name on the account
        <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className="mt-1 h-12 w-full rounded-2xl border border-border bg-card px-4 font-normal outline-none" />
      </label>
      <label className="block text-sm font-medium">
        Amount in UGX
        <input value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="50000" className="mt-1 h-12 w-full rounded-2xl border border-border bg-card px-4 font-normal outline-none" />
      </label>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Kotani Pay collects UGX by {network === "MTN" ? "MTN MoMo" : "Airtel Money"} and sends USDC on Base to {address}. Up to UGX 20,000,000 per request. Approve the prompt on your phone. Nothing moves until Kotani accepts the request.
      </p>
      {error ? <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}
      {message ? <p className="rounded-2xl bg-card px-4 py-3 text-sm">{message}</p> : null}
      <button type="submit" disabled={!status.configured || pending} className={primary}>
        {status.configured ? (pending ? "Contacting Kotani Pay…" : "Request mobile money") : "Not configured"}
      </button>
    </form>
  );
}

function ProviderCard({
  status,
  body,
  endpoint,
  amount,
}: {
  status: ProviderStatus;
  body: string;
  endpoint: string;
  amount: string;
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function open() {
    if (!status.configured) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fiatAmount: amount }),
      });
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error || "The onramp did not open.");
      window.location.assign(payload.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The onramp did not open.");
      setPending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="text-base font-semibold">{status.label}</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <div className="mt-3">
        <Missing status={status} />
      </div>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      <button type="button" onClick={() => void open()} disabled={!status.configured || pending} className={`${primary} mt-4`}>
        {status.configured ? (pending ? "Opening…" : `Continue with ${status.label}`) : "Not configured"}
      </button>
    </section>
  );
}

export function CardOnramps({ transak, coinbase }: { transak: ProviderStatus; coinbase: ProviderStatus }) {
  const [amount, setAmount] = useState("");
  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium">
        Amount in USD
        <input
          value={amount}
          onChange={(event) => {
            const next = event.target.value.replace(/[^\d.]/g, "");
            if (next === "" || /^\d+(\.\d{0,2})?$/.test(next)) setAmount(next);
          }}
          inputMode="decimal"
          placeholder="Optional"
          className="mt-1 h-12 w-full rounded-2xl border border-border bg-card px-4 font-normal outline-none"
        />
      </label>
      <ProviderCard
        status={transak}
        amount={amount}
        endpoint="/api/onramp/transak"
        body="Card, Apple Pay, Google Pay, or a local method where Transak offers it. USDC is delivered on Base to your address."
      />
      <ProviderCard
        status={coinbase}
        amount={amount}
        endpoint="/api/onramp/coinbase"
        body="Coinbase Pay. USDC is delivered on Base to your address. The session token is created on the server."
      />
    </div>
  );
}
