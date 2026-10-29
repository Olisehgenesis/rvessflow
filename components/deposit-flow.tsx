"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toggleConceal, useConceal } from "@/components/balance-card";
import { TokenIcon } from "@/components/token-icon";
import { CopyButton } from "@/components/copy-button";
import { IconCheck, IconChevron, IconClock, IconClose, IconExternal, IconEye, IconEyeOff, IconInfo, IconSearch } from "@/components/icons";
import { TopBar } from "@/components/top-bar";
import { addMoney, continueIntent, previewDeposit } from "@/lib/actions";
import { depositReceipt, sendCalls } from "@/lib/client-sign";
import { depositHref, matchesToken, shortHash, type DepositPreview, type TokenFilter } from "@/lib/deposit-math";
import { explorerUrl, networkLabel } from "@/lib/network";
import type { DepositToken } from "@/lib/deposit-page";
import type { Intent } from "@/lib/intent";
import type { PayAsset } from "@/lib/pay-math";

const primary = "flex h-12 w-full items-center justify-center rounded-full bg-primary text-base font-medium text-primary-foreground disabled:opacity-50";
const secondary = "flex h-12 w-full items-center justify-center rounded-full border border-border bg-card text-base font-medium";

const symbols: Record<PayAsset, string> = { usdc: "USDC", usdt: "USDT", eth: "ETH", usdcx: "USDCx", gdx: "G$" };

export function FlowHeader({ title, back, close }: { title: string; back?: string; close?: string }) {
  return (
    <TopBar
      title={title}
      back={back}
      action={
        close ? (
          <Link href={close} aria-label="Close" className="grid size-10 place-items-center">
            <IconClose className="size-5" />
          </Link>
        ) : null
      }
    />
  );
}

function TokenMark({ pay }: { pay: PayAsset }) {
  return <TokenIcon symbol={symbols[pay]} network={networkLabel()} className="size-10" />;
}

function TokenRow({
  token,
  selected,
  onSelect,
}: {
  token: DepositToken;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-2xl bg-card px-3 py-3 text-left ${selected ? "border-2 border-foreground" : "border border-border"}`}
    >
      <TokenMark pay={token.pay} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{token.label}</span>
        <span className="block text-xs text-muted-foreground tabular-nums">
          {token.balance} {token.label}
        </span>
      </span>
      <span className="text-sm font-medium tabular-nums">≈ ${token.usd}</span>
      {selected ? (
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-background">
          <IconCheck className="size-3.5" />
        </span>
      ) : (
        <span className="size-6 shrink-0" />
      )}
    </button>
  );
}

function sameAmount(left: string, right: string) {
  if (!left || !right) return false;
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && a === b;
}

export function CryptoDeposit({
  totalUsd,
  available,
  streaming,
  locked,
  tokens,
  initialPay,
  initialUsd,
  initialPreview,
  initialError,
}: {
  totalUsd: string;
  available: string;
  streaming: string;
  locked: string;
  tokens: DepositToken[];
  initialPay: PayAsset;
  initialUsd: string;
  initialPreview: DepositPreview | null;
  initialError: string;
}) {
  const conceal = useConceal();
  const [pay, setPay] = useState(initialPay);
  const [usd, setUsd] = useState(initialUsd);
  const [preview, setPreview] = useState(initialPreview);
  const [error, setError] = useState(initialError);
  const [quoted, setQuoted] = useState({ pay: initialPay, usd: initialUsd });
  const [quoting, setQuoting] = useState(false);
  const [open, setOpen] = useState(true);
  const selected = tokens.find((token) => token.pay === pay) ?? tokens[0];
  const money = (value: string) => (conceal ? "••••••" : `$${value}`);

  useEffect(() => {
    if (!usd || Number(usd) <= 0) return;
    let cancel = false;
    const timer = window.setTimeout(() => {
      setQuoting(true);
      void previewDeposit({ pay, usd }).then((result) => {
        if (cancel) return;
        setPreview(result.preview ?? null);
        setError(result.error ?? "");
        setQuoted({ pay, usd });
        setQuoting(false);
      });
    }, 350);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [pay, usd]);

  const fresh = preview && quoted.pay === pay && quoted.usd === usd && Number(usd) > 0 ? preview : null;
  const ready = Boolean(fresh) && !error && Number(usd) > 0;
  const chips = [
    { label: "$25", value: "25" },
    { label: "$50", value: "50" },
    { label: "$100", value: "100" },
    { label: "Max", value: selected?.maxUsd ?? "0.00" },
  ];

  return (
    <main className="px-4 pb-8">
      <FlowHeader title="Top up" back="/home/add" />
      <section className="rounded-3xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Wallet balance</p>
          <button
            type="button"
            aria-label={conceal ? "Show balance" : "Hide balance"}
            aria-pressed={conceal}
            onClick={toggleConceal}
            className="grid size-8 place-items-center text-muted-foreground"
          >
            {conceal ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
          </button>
        </div>
        <p className="mt-1 font-display text-4xl font-semibold tracking-tight tabular-nums">{money(totalUsd)}</p>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Available</dt>
            <dd className="mt-1 font-medium tabular-nums">{money(available)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Streaming</dt>
            <dd className="mt-1 font-medium tabular-nums">{money(streaming)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Locked</dt>
            <dd className="mt-1 font-medium tabular-nums">{money(locked)}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6">
        <h2 className="text-base font-semibold">Choose payment token</h2>
        <p className="mt-1 text-sm text-muted-foreground">This moves a token on {networkLabel()} into the savings vault. Tokens on the other chain stay in the wallet.</p>
        <div className="mt-3 space-y-2">
          {tokens.map((token) => (
            <TokenRow key={token.pay} token={token} selected={token.pay === pay} onSelect={() => setPay(token.pay)} />
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-base font-semibold">Amount to deposit</h2>
        <label className="relative mt-3 block">
          <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-lg text-muted-foreground">$</span>
          <input
            inputMode="decimal"
            aria-label="Amount to deposit in USD"
            value={usd}
            placeholder="0"
            onChange={(event) => {
              const next = event.target.value.replace(/[^\d.]/g, "");
              if (next === "" || /^\d+(\.\d{0,2})?$/.test(next)) setUsd(next);
            }}
            className="h-14 w-full rounded-2xl border border-border bg-card pr-12 pl-8 text-lg font-medium tabular-nums outline-none"
          />
          {usd ? (
            <button type="button" aria-label="Clear amount" onClick={() => setUsd("")} className="absolute top-1/2 right-3 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-muted text-muted-foreground">
              <IconClose className="size-3.5" />
            </button>
          ) : null}
        </label>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {chips.map((chip) => {
            const active = sameAmount(usd, chip.value);
            return (
              <button
                key={chip.label}
                type="button"
                onClick={() => setUsd(chip.value)}
                className={`h-10 rounded-full text-sm font-medium ${active ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between text-sm font-medium" aria-expanded={open}>
          Estimated deposit details
          <IconChevron className={`size-4 transition ${open ? "rotate-90" : ""}`} />
        </button>
        {open ? (
          <dl className="mt-3 rounded-2xl border border-border bg-card px-4 py-1">
            {error && quoted.usd === usd ? <p className="py-3 text-sm text-destructive">{error}</p> : null}
            {!fresh && !(error && quoted.usd === usd) ? (
              <p className="py-3 text-sm text-muted-foreground">{quoting || (usd && Number(usd) > 0) ? "Updating the quote…" : "Enter an amount to price this deposit."}</p>
            ) : null}
            {fresh && !error ? (
              <>
                <Detail label="You'll receive" value={`$${fresh.receiveUsd}`} />
                <Detail label="You spend" value={fresh.amountIn} hint={fresh.spendMax === fresh.amountIn ? undefined : `at most ${fresh.spendMax}`} />
                <Detail label="Protocol fee" value={`$${fresh.protocolFeeUsd} (${fresh.protocolFeePct})`} />
                <Detail label="Exchange rate" value={fresh.rate} />
                <Detail label="Slippage tolerance" value={fresh.slippage} />
                <Detail label="Transaction deadline" value={fresh.deadline} />
              </>
            ) : null}
          </dl>
        ) : null}
      </section>

      <Link href={ready ? depositHref("/home/add/token", pay, usd) : "/home/add/crypto"} aria-disabled={!ready} className={`${primary} mt-6 ${ready ? "" : "pointer-events-none opacity-50"}`}>
        Continue
      </Link>
    </main>
  );
}

function Detail({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-3 text-sm last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">
        {value}
        {hint ? <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{hint}</span> : null}
      </dd>
    </div>
  );
}

const filterLabels: { id: TokenFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "stable", label: "Stablecoins" },
  { id: "popular", label: "Popular" },
  { id: "other", label: "Other" },
];

export function TokenSelect({ tokens, pay, usd }: { tokens: DepositToken[]; pay: PayAsset; usd: string }) {
  const [selected, setSelected] = useState(pay);
  const [filter, setFilter] = useState<TokenFilter>("all");
  const [query, setQuery] = useState("");
  const shown = tokens.filter((token) => matchesToken(token.pay, filter, query));
  return (
    <main className="px-4 pb-8">
      <FlowHeader title="Select token" back={depositHref("/home/add/crypto", pay, usd)} />
      <label className="relative block">
        <IconSearch className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tokens..."
          aria-label="Search tokens"
          className="h-12 w-full rounded-full border border-border bg-card pr-4 pl-11 text-sm outline-none"
        />
      </label>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {filterLabels.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
            className={`h-9 shrink-0 rounded-full px-4 text-sm font-medium ${filter === item.id ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mt-3 space-y-2">
        {shown.map((token) => (
          <button
            key={token.pay}
            type="button"
            aria-pressed={token.pay === selected}
            onClick={() => setSelected(token.pay)}
            className={`flex w-full items-center gap-3 rounded-2xl bg-card px-3 py-3 text-left ${token.pay === selected ? "border-2 border-foreground" : "border border-border"}`}
          >
            <TokenMark pay={token.pay} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{token.label}</span>
              <span className="block text-xs text-muted-foreground">{token.name}</span>
            </span>
            <span className="text-right">
              <span className="block text-sm font-medium tabular-nums">{token.balance}</span>
              <span className="block text-xs text-muted-foreground tabular-nums">≈ ${token.usd}</span>
            </span>
            {token.pay === selected ? (
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-background">
                <IconCheck className="size-3.5" />
              </span>
            ) : (
              <span className="size-6 shrink-0" />
            )}
          </button>
        ))}
        {shown.length === 0 ? <p className="rounded-2xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">No tokens in this group yet.</p> : null}
      </div>
      <p className="mt-4 flex gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm leading-relaxed text-muted-foreground">
        <IconInfo className="mt-0.5 size-4 shrink-0" />
        USDC, USDT and ETH are supported for deposits. Other tokens will be available soon.
      </p>
      <Link href={depositHref("/home/add/review", selected, usd)} className={`${primary} mt-6`}>
        Continue
      </Link>
    </main>
  );
}

function Party({ kicker, pay, title, name, amount, usd }: { kicker: string; pay?: PayAsset; title: string; name: string; amount: string; usd: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-3">
      <p className="text-xs text-muted-foreground">{kicker}</p>
      <div className="mt-2 flex items-center gap-3">
        {pay ? <TokenMark pay={pay} /> : <span className="grid size-10 place-items-center rounded-full bg-foreground text-sm font-semibold text-background">$</span>}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block text-xs text-muted-foreground">{name}</span>
        </span>
        <span className="text-right">
          <span className="block text-sm font-medium tabular-nums">{amount}</span>
          <span className="block text-xs text-muted-foreground tabular-nums">≈ ${usd}</span>
        </span>
      </div>
    </div>
  );
}

export function ReviewDeposit({ pay, usd, preview }: { pay: PayAsset; usd: string; preview: DepositPreview }) {
  return (
    <main className="px-4 pb-8">
      <FlowHeader title="Review deposit" back={depositHref("/home/add/token", pay, usd)} />
      <Party kicker="From" pay={preview.pay} title={preview.symbol} name={preview.tokenName} amount={preview.amountIn} usd={preview.amountInUsd} />
      <div className="relative z-10 -my-3 flex justify-center">
        <span className="grid size-8 place-items-center rounded-full border border-border bg-background">
          <IconChevron className="size-4 rotate-90" />
        </span>
      </div>
      <Party kicker="To" title="USD" name="In your vault" amount={`$${preview.receiveUsd}`} usd={preview.receiveUsd} />

      <h2 className="mt-6 text-base font-semibold">Deposit details</h2>
      <dl className="mt-2 rounded-2xl border border-border bg-card px-4">
        <Detail label="Amount (in)" value={preview.amountIn} hint={`≈ $${preview.amountInUsd}`} />
        <Detail label="Estimated received" value={`$${preview.receiveUsd}`} hint={`${preview.wrappedUsdc} USDC wrapped`} />
        <Detail label="Protocol fee" value={`$${preview.protocolFeeUsd} (${preview.protocolFeePct})`} />
        <Detail
          label="Network fee"
          value={preview.networkFeeKnown ? (preview.networkFeeSubCent ? "< $0.01 (est.)" : `$${preview.networkFeeUsd} (est.)`) : "Unavailable"}
        />
        <Detail label="Total fees" value={preview.totalFeeKnown ? `$${preview.totalFeeUsd}` : "Unavailable"} />
        <Detail label="Exchange rate" value={preview.rate} />
        <Detail label="Slippage tolerance" value={preview.slippage} />
        <Detail label="Transaction deadline" value={preview.deadline} />
      </dl>
      <p className="mt-4 flex gap-2 rounded-2xl bg-[#f3f0e6] px-4 py-3 text-sm leading-relaxed">
        <IconInfo className="mt-0.5 size-4 shrink-0" />
        {preview.priceImpactNote}
      </p>
      <ConfirmDeposit pay={pay} usd={usd} />
      <Link href={depositHref("/home/add/crypto", pay, usd)} className={`${secondary} mt-3`}>
        Edit details
      </Link>
    </main>
  );
}

function explain(error: unknown): string {
  const message = error instanceof Error ? error.message : "The transaction failed.";
  if (/reject|denied|dismiss/i.test(message)) return "The signature was dismissed.";
  const line = message.split("\n").find((item) => item.trim()) ?? message;
  return line.replace(/^Error:\s*/, "").slice(0, 220);
}

function ConfirmDeposit({ pay, usd }: { pay: PayAsset; usd: string }) {
  const router = useRouter();
  const [state, run, pending] = useActionState(addMoney, null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const sent = useRef("");

  useEffect(() => {
    const sign = state?.sign;
    if (!sign) return;
    let cancel = false;
    const go = async () => {
      await Promise.resolve();
      if (cancel || sent.current === sign.nonce) return;
      sent.current = sign.nonce;
      setSigning(true);
      setLocalError(null);
      try {
        let current = sign;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          if (cancel) return;
          if (current.calls.length) {
            await sendCalls(current, {
              onHash(hash) {
                if (current.intent.kind !== "deposit" || !current.intent.submitted) return;
                sessionStorage.setItem("rvess-deposit", JSON.stringify({ intent: current.intent, hash }));
                router.push(`${depositHref("/home/add/status", pay, usd)}&hash=${hash}`);
              },
            });
          }
          if (cancel) return;
          const next = await continueIntent(current.intent);
          if (next.error) throw new Error(next.error);
          if (next.href) {
            if (!sessionStorage.getItem("rvess-deposit")) router.push(next.href);
            return;
          }
          if (!next.sign) return;
          current = next.sign;
        }
        throw new Error("That transaction did not finish.");
      } catch (error) {
        if (!cancel) setLocalError(explain(error));
      } finally {
        if (!cancel) setSigning(false);
      }
    };
    void go();
    return () => {
      cancel = true;
    };
  }, [state, router, pay, usd]);

  const busy = pending || signing;
  const error = localError || state?.error;
  return (
    <form action={run} className="mt-5">
      <input type="hidden" name="pay" value={pay} />
      <input type="hidden" name="amount" value={usd} />
      {error ? <p className="mb-3 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}
      <button type="submit" disabled={busy} className={primary}>
        {busy ? "Waiting for your wallet…" : "Confirm deposit"}
      </button>
    </form>
  );
}

type Phase = "waiting" | "processing" | "success" | "reverted";

function clock(unix?: number) {
  if (!unix) return "";
  return new Date(unix * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function DepositStatus({
  hash,
  done,
  usd,
  preview,
}: {
  hash: string;
  done: boolean;
  usd: string;
  preview: DepositPreview | null;
}) {
  const [phase, setPhase] = useState<Phase>(done && !hash ? "success" : hash ? "processing" : "waiting");
  const [when, setWhen] = useState("");
  const recorded = useRef(false);

  useEffect(() => {
    if (!hash) return;
    let cancel = false;
    const look = async () => {
      const receipt = await depositReceipt(hash as `0x${string}`);
      if (cancel) return;
      if (receipt.status === "pending") return;
      setPhase(receipt.status === "success" ? "success" : "reverted");
      setWhen(clock(receipt.timestamp));
    };
    void look();
    const timer = window.setInterval(() => void look(), 4000);
    return () => {
      cancel = true;
      window.clearInterval(timer);
    };
  }, [hash]);

  useEffect(() => {
    if (phase !== "success" || !hash || recorded.current) return;
    const raw = sessionStorage.getItem("rvess-deposit");
    if (!raw) return;
    let saved: { hash?: string; intent?: Intent };
    try {
      saved = JSON.parse(raw) as { hash?: string; intent?: Intent };
    } catch {
      return;
    }
    if (saved.hash !== hash || !saved.intent) return;
    recorded.current = true;
    const intent = saved.intent;
    const finish = async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const next = await continueIntent(intent);
        if (!next.error) {
          sessionStorage.removeItem("rvess-deposit");
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
      }
    };
    void finish();
  }, [phase, hash]);

  const success = phase === "success";
  const steps = [
    {
      title: "Confirm in wallet",
      detail: phase === "waiting" ? "Waiting for your wallet" : success || phase === "processing" || phase === "reverted" ? (when && success ? `Signed · ${when}` : "Signed") : "Waiting",
      state: phase === "waiting" ? "current" : "done",
    },
    {
      title: "Processing deposit",
      detail: phase === "processing" ? "In progress" : phase === "reverted" ? "Reverted" : success ? "Completed" : "Pending",
      state: phase === "processing" ? "current" : phase === "reverted" ? "failed" : success ? "done" : "pending",
    },
    {
      title: "Deposit complete",
      detail: success ? (when ? `Completed · ${when}` : "Completed") : "Pending",
      state: success ? "done" : "pending",
    },
  ] as const;

  return (
    <main className="px-4 pb-8">
      <FlowHeader title="Rvess" back={preview ? depositHref("/home/add/review", preview.pay, usd) : "/home/add"} close="/home" />
      <div className="mt-4 flex flex-col items-center text-center">
        <span className="grid size-16 place-items-center rounded-full border border-border bg-card">
          {success ? <IconCheck className="size-7" /> : <IconClock className="size-7" />}
        </span>
        <h2 className="mt-4 font-display text-xl font-semibold">{success ? "Deposit complete" : phase === "reverted" ? "Deposit failed" : "Deposit in progress"}</h2>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          {success ? "The USD is in your vault." : phase === "waiting" ? "Confirm the deposit in your wallet to start it." : "Your funds are being processed. This may take a few minutes."}
        </p>
      </div>
      <ol className="mt-6 space-y-0">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span className="flex flex-col items-center self-stretch">
              <span
                className={`grid size-7 place-items-center rounded-full text-xs font-semibold ${
                  step.state === "done" || step.state === "current" ? "bg-foreground text-background" : step.state === "failed" ? "bg-destructive text-white" : "bg-muted text-muted-foreground"
                }`}
              >
                {step.state === "done" ? <IconCheck className="size-3.5" /> : index + 1}
              </span>
              {index < steps.length - 1 ? <span className="my-1 w-px flex-1 bg-border" /> : null}
            </span>
            <span className="pb-4">
              <span className="block text-sm font-medium">{step.title}</span>
              <span className="block text-xs text-muted-foreground">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
      <section className="rounded-2xl border border-border bg-card px-4 py-1">
        <h2 className="pt-3 text-sm font-semibold">Transaction details</h2>
        <dl>
          <div className="flex items-center justify-between gap-3 border-b border-border py-3 text-sm">
            <dt className="text-muted-foreground">Transaction hash</dt>
            <dd className="flex items-center gap-1 font-medium">
              {hash ? (
                <>
                  <span className="tabular-nums">{shortHash(hash)}</span>
                  <CopyButton value={hash} label="Copy" />
                  <a href={`${explorerUrl()}/tx/${hash}`} target="_blank" rel="noreferrer" aria-label={`View this transaction on ${networkLabel()}`} className="grid size-8 place-items-center">
                    <IconExternal className="size-4" />
                  </a>
                </>
              ) : (
                <span className="text-muted-foreground">{done ? "Signed with the test account" : "Waiting for your wallet"}</span>
              )}
            </dd>
          </div>
          {preview ? (
            <>
              <Detail label="From" value={preview.amountIn} />
              <Detail label="To" value={`$${preview.receiveUsd}`} />
              <Detail label="Total fees" value={preview.totalFeeKnown ? `$${preview.totalFeeUsd}` : `$${preview.protocolFeeUsd} protocol`} />
            </>
          ) : null}
        </dl>
      </section>
      <Link href="/home" className={`${secondary} mt-6`}>
        Back to wallet
      </Link>
    </main>
  );
}
