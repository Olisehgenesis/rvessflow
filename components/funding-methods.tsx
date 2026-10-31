"use client";

import { useEffect, useState } from "react";
import { GdxSwap } from "@/components/gdx-swap";
import { TokenIcon } from "@/components/token-icon";
import type { FonbnkSide, ProviderStatus } from "@/lib/onramp";
import type { GdxTradeBalances } from "@/lib/token-face";

const primary = "flex h-12 w-full items-center justify-center rounded-full bg-primary text-base font-medium text-primary-foreground disabled:opacity-50";

const countries = [
  { id: "", label: "All" },
  { id: "UG", label: "Uganda" },
  { id: "KE", label: "Kenya" },
  { id: "NG", label: "Nigeria" },
  { id: "GH", label: "Ghana" },
  { id: "TZ", label: "Tanzania" },
  { id: "ZA", label: "South Africa" },
] as const;

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

type CashToken = "usdt" | "gdx";

export function MobileMoneyForm({
  status,
  address,
  side = "buy",
  trade,
}: {
  status: ProviderStatus;
  address: string;
  side?: FonbnkSide;
  trade: GdxTradeBalances;
}) {
  const [flow, setFlow] = useState<FonbnkSide>(side);
  const [token, setToken] = useState<CashToken>("usdt");
  const [country, setCountry] = useState("UG");
  const [amount, setAmount] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(true);

  async function loadWidget(next: FonbnkSide, iso: string, local: string) {
    if (!status.configured) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/onramp/mobile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side: next, country: iso, amount: local }),
      });
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error || "Fonbnk did not open.");
      setUrl(payload.url);
    } catch (caught) {
      setUrl("");
      setError(caught instanceof Error ? caught.message : "Fonbnk did not open.");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    void loadWidget(flow, country, amount);
    // First paint loads the hosted checkout. Later changes use the buttons below.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount + flow only
  }, [flow]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["buy", "Buy USDC"],
            ["sell", "Cash out"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={flow === id}
            onClick={() => setFlow(id)}
            className={`h-12 rounded-2xl text-sm font-medium ${flow === id ? "border-2 border-foreground bg-card" : "border border-border bg-card"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">{flow === "buy" ? "You receive" : "You cash out"}</p>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { id: "usdt" as const, symbol: "USDT", name: "Tether on Celo" },
              { id: "gdx" as const, symbol: "G$", name: "Good Dollar" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={token === item.id}
              onClick={() => setToken(item.id)}
              className={`flex items-center gap-2 rounded-2xl px-3 py-3 text-left ${token === item.id ? "border-2 border-foreground bg-white" : "border border-border bg-card"}`}
            >
              <TokenIcon symbol={item.symbol} network="Celo" className="size-8" withChain={false} />
              <span>
                <span className="block text-sm font-semibold">{item.symbol}</span>
                <span className="block text-xs text-[#5C6572]">{item.name}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Country</p>
        <div className="flex flex-wrap gap-2">
          {countries.map((item) => (
            <button
              key={item.id || "all"}
              type="button"
              aria-pressed={country === item.id}
              onClick={() => {
                setCountry(item.id);
                void loadWidget(flow, item.id, amount);
              }}
              className={`h-10 rounded-full px-3.5 text-sm font-medium ${country === item.id ? "bg-[#E7F4C4] text-[#141414]" : "border border-[#E6EADF] bg-white text-[#3A3F47]"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void loadWidget(flow, country, amount);
        }}
      >
        <label className="block min-w-0 flex-1 text-sm font-medium">
          Amount in local currency
          <input value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="Optional" className="mt-1 h-12 w-full rounded-2xl border border-border bg-card px-4 font-normal outline-none" />
        </label>
        <button type="submit" className="mt-6 h-12 shrink-0 rounded-full bg-[#141414] px-4 text-sm font-semibold text-white">
          Update
        </button>
      </form>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {flow === "buy" && token === "usdt"
          ? `Fonbnk sends USDT on Celo to ${address}.`
          : flow === "buy"
            ? "Fonbnk first sends USDT on Celo. Swap that USDT into G$ below when it lands."
            : token === "usdt"
              ? "Fonbnk takes USDT on Celo and pays your phone or bank."
              : "Sell G$ into USDT first. Then cash that USDT out with Fonbnk."}
      </p>
      {error ? <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}
      {flow === "sell" && token === "gdx" ? (
        <section className="rounded-[1.4rem] border border-[#E6EADF] bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-[#141414]">1. Sell G$ for USDT</h2>
          <GdxSwap key="sell-gdx" trade={trade} initialVia="usdt" initialSide="sell" />
        </section>
      ) : null}
      <div className="overflow-hidden rounded-[1.4rem] border border-[#E6EADF] bg-white">
        {token === "gdx" ? (
          <p className="border-b border-[#E6EADF] px-4 py-2 text-xs text-[#5C6572]">
            {flow === "buy" ? "1. Buy USDT with mobile money" : "2. Cash out USDT"}
          </p>
        ) : null}
        {pending && !url ? <p className="px-4 py-16 text-center text-sm text-[#5C6572]">Loading Fonbnk…</p> : null}
        {url ? (
          <iframe
            key={url}
            title="Fonbnk"
            src={url}
            className="h-[min(44rem,80dvh)] w-full bg-white"
            allow="camera; microphone; payment; clipboard-write; geolocation"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : null}
      </div>
      {flow === "buy" && token === "gdx" ? (
        <section className="rounded-[1.4rem] border border-[#E6EADF] bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-[#141414]">2. Swap USDT into G$</h2>
          <GdxSwap key="buy-gdx" trade={trade} initialVia="usdt" initialSide="buy" />
        </section>
      ) : null}
    </div>
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
