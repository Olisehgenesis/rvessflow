"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { IconBack, IconClose } from "@/components/icons";
import type { FonbnkSide, ProviderStatus } from "@/lib/onramp";

const primary = "flex h-12 w-full items-center justify-center rounded-full bg-primary text-base font-medium text-primary-foreground disabled:opacity-50";

const countryName: Record<string, string> = {
  UG: "Uganda",
  KE: "Kenya",
  NG: "Nigeria",
  GH: "Ghana",
  TZ: "Tanzania",
  ZA: "South Africa",
  EG: "Egypt",
  IN: "India",
  BR: "Brazil",
  MX: "Mexico",
  AE: "United Arab Emirates",
};

function amountChips(unit: string): string[] {
  if (unit === "UGX") return ["20000", "50000", "100000"];
  if (unit === "KES") return ["500", "2000", "5000"];
  if (unit === "NGN") return ["5000", "20000", "50000"];
  if (unit === "GHS") return ["50", "200", "500"];
  if (unit === "ZAR") return ["100", "250", "500"];
  if (unit === "EGP") return ["200", "500", "1000"];
  if (unit === "INR") return ["500", "2000", "5000"];
  return ["20", "50", "100"];
}

function formatLocal(value: string) {
  if (!value) return "0";
  return Number(value).toLocaleString("en-US");
}

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

export function MobileMoneyForm({
  status,
  address,
  side = "buy",
  country,
  unit,
}: {
  status: ProviderStatus;
  address: string;
  side?: FonbnkSide;
  country: string;
  unit: string;
}) {
  const router = useRouter();
  const [flow, setFlow] = useState<FonbnkSide>(side);
  const [amount, setAmount] = useState("");
  const [url, setUrl] = useState("");
  const [checkout, setCheckout] = useState(false);
  const [ask, setAsk] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const place = countryName[country] || country;

  async function openCheckout() {
    if (!status.configured) return;
    if (!amount) {
      setError(`Enter how much in ${unit}.`);
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/onramp/mobile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side: flow, amount }),
      });
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error || "Fonbnk did not open.");
      setUrl(payload.url);
      setAsk(false);
      setCheckout(true);
    } catch (caught) {
      setUrl("");
      setCheckout(false);
      setError(caught instanceof Error ? caught.message : "Fonbnk did not open.");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    document.body.style.overflow = ask || checkout ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [ask, checkout]);

  return (
    <>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {place} · {unit}. USDT on Celo to {address.slice(0, 6)}…{address.slice(-4)}.
      </p>
      {!ask && !checkout ? (
        <button type="button" onClick={() => setAsk(true)} className={`${primary} mt-6 bg-[#D4F06B] text-[#141414]`}>
          {flow === "buy" ? "How much to buy" : "How much to cash out"}
        </button>
      ) : null}
      <Dialog.Root open={ask && !checkout} onOpenChange={setAsk}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-[#141414]/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
          <Dialog.Content className="fixed right-0 bottom-0 left-0 z-[61] rounded-t-[1.75rem] bg-white px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-24px_80px_-28px_rgba(20,20,20,0.45)] outline-none sm:top-1/2 sm:right-auto sm:bottom-auto sm:left-1/2 sm:w-[min(100%-1.5rem,24.5rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[1.6rem] sm:pb-5">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border sm:hidden" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="text-[1.35rem] font-semibold tracking-[-0.04em]">{flow === "buy" ? "How much to buy" : "How much to cash out"}</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-[#5C6572]">
                  {place} · {unit}
                </Dialog.Description>
              </div>
              <Dialog.Close
                aria-label="Close"
                onClick={() => router.push("/home/add")}
                className="grid size-9 shrink-0 place-items-center rounded-full text-foreground"
              >
                <IconClose className="size-5" />
              </Dialog.Close>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-1 rounded-full bg-[#F3F1EA] p-1">
              {(
                [
                  ["buy", "Buy"],
                  ["sell", "Cash out"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={flow === id}
                  onClick={() => setFlow(id)}
                  className={`h-10 rounded-full text-sm font-semibold ${flow === id ? "bg-white text-[#141414] shadow-[0_1px_4px_rgba(20,20,20,0.08)]" : "text-[#5C6572]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="mt-5 block">
              <span className="sr-only">Amount in {unit}</span>
              <span className="flex items-end gap-2 border-b border-[#E6EADF] pb-2">
                <input
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value.replace(/[^\d]/g, ""));
                    setError("");
                  }}
                  inputMode="numeric"
                  autoFocus
                  placeholder="0"
                  className="min-w-0 flex-1 bg-transparent text-[2.65rem] leading-none font-semibold tracking-[-0.05em] tabular-nums outline-none placeholder:text-[#C9CDC3]"
                />
                <span className="mb-1 text-sm font-semibold text-[#5C6572]">{unit}</span>
              </span>
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              {amountChips(unit).map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => {
                    setAmount(chip);
                    setError("");
                  }}
                  className={`h-9 rounded-full px-3.5 text-sm font-medium ${amount === chip ? "bg-[#D4F06B] text-[#141414]" : "bg-[#F3F1EA] text-[#3A3F47]"}`}
                >
                  {formatLocal(chip)}
                </button>
              ))}
            </div>
            {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
            {!status.configured ? (
              <div className="mt-3">
                <Missing status={status} />
              </div>
            ) : null}
            <button type="button" onClick={() => void openCheckout()} disabled={!status.configured || pending || !amount} className={`${primary} mt-5 bg-[#D4F06B] text-[#141414]`}>
              {pending ? "Opening…" : flow === "buy" ? "Buy" : "Cash out"}
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {checkout && url ? (
        <div className="fixed inset-0 z-[70] flex flex-col bg-white">
          <header className="flex h-14 shrink-0 items-center gap-1 border-b border-[#E6EADF] bg-[#F7F6F3] px-2 pt-[env(safe-area-inset-top)]">
            <button
              type="button"
              onClick={() => {
                setCheckout(false);
                setAsk(true);
              }}
              aria-label="Back"
              className="grid size-11 place-items-center rounded-full"
            >
              <IconBack className="size-5" />
            </button>
            <p className="min-w-0 flex-1 truncate text-base font-semibold">{flow === "buy" ? "Buy" : "Cash out"}</p>
          </header>
          <iframe
            key={url}
            title={flow === "buy" ? "Fonbnk onramp" : "Fonbnk offramp"}
            src={url}
            className="min-h-0 w-full flex-1 border-0 bg-white"
            allow="camera; microphone; payment; clipboard-write; geolocation"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : null}
    </>
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
