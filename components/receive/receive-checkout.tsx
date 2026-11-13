"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Check, ChevronDown, CreditCard, Smartphone, Wallet } from "lucide-react";
import { useSignedAction } from "@/components/sign-action";
import { ErrorNote } from "@/components/ui-bits";
import { useReceiveConnect } from "@/components/receive/receive-connect";
import { ProfileAvatar } from "@/components/profile-avatar";
import { contributeOnce, contributeStream, readContributeBalances } from "@/lib/actions";
import {
  frequencyLabel,
  moneyOk,
  onceMinimum,
  streamCommitment,
  truncateAddress,
  type ReceiveLinkConfig,
  type StreamFrequency,
} from "@/lib/receive-link";
import type { PublicReceiveProfile } from "@/lib/receive-resolve";

type Mode = "once" | "stream";
type Step = "details" | "pay" | "confirm" | "done";
type PayMethod = "wallet" | "mobile" | "card";
type OnceAsset = (typeof onceTokenOptions)[number]["asset"];
type BalanceRow = { asset: string; label: string; network: string; balance: string };

const onceTokenOptions = [
  { asset: "base-usdc", label: "USDC", network: "Base" },
  { asset: "celo-usdc", label: "USDC", network: "Celo" },
  { asset: "base-usdt", label: "USDT", network: "Base" },
  { asset: "celo-usdt", label: "USDT", network: "Celo" },
  { asset: "celo-gdx", label: "G$", network: "Celo" },
] as const;

const streamPayOptions = [
  { pay: "usdc", label: "USDC", network: "base" as const, asset: "base-usdc" },
  { pay: "usdt", label: "USDT", network: "base" as const, asset: "base-usdt" },
  { pay: "usdc", label: "USDC", network: "celo" as const, asset: "celo-usdc" },
  { pay: "usdt", label: "USDT", network: "celo" as const, asset: "celo-usdt" },
  { pay: "gdx", label: "G$", network: "celo" as const, asset: "celo-gdx" },
] as const;

function moneyOf(value: string) {
  return Number(value.replace(/,/g, "").trim()) || 0;
}

function formatMoney(value: number, digits = 2) {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return value >= 100 ? value.toFixed(0) : value.toFixed(digits).replace(/\.?0+$/, "") || "0";
}

function perDayRate(rate: string, frequency: StreamFrequency) {
  const n = moneyOf(rate);
  if (frequency === "daily") return n;
  if (frequency === "weekly") return n / 7;
  return n / 30;
}

/** Rough on-chain stream deposit need: face + CFA buffer + 1h cushion. */
function streamNeedEstimate(rate: string, frequency: StreamFrequency, durationDays: number) {
  const face = moneyOf(streamCommitment(rate, frequency, durationDays));
  const daily = perDayRate(rate, frequency);
  const hour = daily / 24;
  const buffer = daily * (4 / 24) * 2;
  const protocol = face * 0.003;
  return face + hour + buffer + protocol;
}

function pickDefaultOnceAsset(tokens: (typeof onceTokenOptions)[number][]): OnceAsset {
  return (
    tokens.find((item) => item.asset === "base-usdc")?.asset ??
    tokens.find((item) => item.label === "USDC")?.asset ??
    tokens[0]?.asset ??
    "base-usdc"
  );
}

function pickFundedOnce(tokens: (typeof onceTokenOptions)[number][], rows: BalanceRow[], current: OnceAsset): OnceAsset {
  const funded = tokens
    .map((token) => ({ token, bal: moneyOf(rows.find((row) => row.asset === token.asset)?.balance ?? "0") }))
    .filter((row) => row.bal > 0)
    .sort((a, b) => b.bal - a.bal);
  if (!funded.length) return current;
  if (funded.some((row) => row.token.asset === current)) return current;
  return (
    funded.find((row) => row.token.asset === "base-usdc")?.token.asset ??
    funded.find((row) => row.token.label === "USDC")?.token.asset ??
    funded[0].token.asset
  );
}

function useBalances(wallet: string | null, assets: string[]) {
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const key = assets.join(",");

  useEffect(() => {
    if (!wallet || !assets.length) {
      setRows([]);
      setError("");
      return;
    }
    let cancel = false;
    setLoading(true);
    setError("");
    void readContributeBalances(wallet, assets).then((result) => {
      if (cancel) return;
      setLoading(false);
      if (result.error) {
        setError(result.error);
        setRows([]);
        return;
      }
      setRows(result.rows ?? []);
    });
    return () => {
      cancel = true;
    };
  }, [wallet, key]);

  return { rows, loading, error };
}

export function ReceiveCheckout({
  identifier,
  profile,
  config,
  payTo,
  viewerAddress,
  initialSuccess,
}: {
  identifier: string;
  profile: PublicReceiveProfile;
  config: ReceiveLinkConfig;
  payTo: string;
  viewerAddress?: string | null;
  initialSuccess?: "once" | "stream" | null;
}) {
  const both = config.onceEnabled && config.streamEnabled;
  const [mode, setMode] = useState<Mode>(
    initialSuccess === "stream" ? "stream" : config.onceEnabled ? "once" : "stream",
  );
  const connect = useReceiveConnect();
  const [wallet, setWallet] = useState(viewerAddress ?? null);

  return (
    <section className="rounded-[1.6rem] border border-[#E6EADF] bg-white shadow-[0_1px_0_rgba(20,20,20,0.04)]">
      <div className="border-b border-[#E6EADF] px-5 py-4">
        <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#141414]">Contribute</h2>
        <p className="mt-1 text-sm text-[#5C6572]">
          {mode === "once" ? "Make a single contribution." : "Support continuously with a stream."}
        </p>
      </div>

      {both ? (
        <div className="grid grid-cols-2 gap-2 px-4 pt-4 sm:px-5">
          <ModeTab active={mode === "once"} onClick={() => setMode("once")} title="Give once" hint="One-time" />
          <ModeTab active={mode === "stream"} onClick={() => setMode("stream")} title="Stream" hint="Continuous" />
        </div>
      ) : null}

      <div className="px-4 py-4 sm:px-5">
        {mode === "once" && config.onceEnabled ? (
          <OnceForm
            identifier={identifier}
            profile={profile}
            config={config}
            wallet={wallet}
            setWallet={setWallet}
            connect={connect}
            startDone={initialSuccess === "once"}
          />
        ) : null}
        {mode === "stream" && config.streamEnabled ? (
          <StreamForm
            identifier={identifier}
            profile={profile}
            config={config}
            wallet={wallet}
            setWallet={setWallet}
            connect={connect}
            startDone={initialSuccess === "stream"}
          />
        ) : null}
        {!config.onceEnabled && !config.streamEnabled ? (
          <p className="text-sm text-[#5C6572]">No contribution options are available.</p>
        ) : null}
      </div>
    </section>
  );
}

function ModeTab({ active, onClick, title, hint }: { active: boolean; onClick: () => void; title: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-2xl px-3 py-3 text-left transition ${
        active ? "bg-[#D6F34A] text-[#141414] ring-1 ring-[#141414]/10" : "bg-[#F7F6F3] text-[#141414] hover:bg-[#F3F1EA]"
      }`}
    >
      <span className="block text-sm font-semibold">{title}</span>
      <span className={`block text-xs ${active ? "text-[#141414]/70" : "text-[#5C6572]"}`}>{hint}</span>
    </button>
  );
}

function OnceForm({
  identifier,
  profile,
  config,
  wallet,
  setWallet,
  connect,
  startDone,
}: {
  identifier: string;
  profile: PublicReceiveProfile;
  config: ReceiveLinkConfig;
  wallet: string | null;
  setWallet: (value: string | null) => void;
  connect: ReturnType<typeof useReceiveConnect>;
  startDone?: boolean;
}) {
  const tokens = useMemo(
    () => onceTokenOptions.filter((item) => config.tokens.includes(item.asset) || config.tokens.length === 0),
    [config.tokens],
  );
  const tokenAssets = useMemo(() => tokens.map((item) => item.asset), [tokens]);
  const [step, setStep] = useState<Step>(startDone ? "done" : "details");
  const [payMethod, setPayMethod] = useState<PayMethod>("wallet");
  const [asset, setAsset] = useState<OnceAsset>(() => pickDefaultOnceAsset(tokens));
  const [amount, setAmount] = useState(config.oncePresets[0] ?? "10");
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const balances = useBalances(wallet, tokenAssets);
  const [state, action, pending] = useSignedAction(contributeOnce, {
    art: "/marks/receive.png",
    title: "Sending contribution",
    onSuccess: () => setStep("done"),
  });

  useEffect(() => {
    if (!balances.rows.length) return;
    setAsset((current) => pickFundedOnce(tokens, balances.rows, current));
  }, [balances.rows, tokens]);

  const picked = tokens.find((item) => item.asset === asset) ?? tokens[0];
  const finalAmount = custom.trim() || amount;
  const min = onceMinimum(config);
  const amountReady = moneyOk(finalAmount) && Number(finalAmount) >= min;
  const held = balances.rows.find((row) => row.asset === asset);
  const balance = held?.balance ?? null;
  const need = moneyOf(finalAmount);
  const have = balance === null ? null : moneyOf(balance);
  const shortfall = have !== null && amountReady && have + 1e-9 < need;
  const shortMsg =
    shortfall && picked
      ? `This account has ${formatMoney(have!)} ${picked.label}. This needs ${formatMoney(need)} ${picked.label}.`
      : "";

  async function goPay() {
    if (!amountReady) return;
    setStep("pay");
  }

  async function goConfirm() {
    if (payMethod !== "wallet") return;
    let address = wallet;
    if (!address) {
      address = await connect.connect();
      if (!address) return;
      setWallet(address);
    }
    setStep("confirm");
  }

  async function onConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (shortfall) return;
    if (!wallet) {
      const address = await connect.connect();
      if (!address) return;
      setWallet(address);
    }
    action(new FormData(event.currentTarget));
  }

  if (step === "done") {
    return <SuccessCard kind="once" profile={profile} identifier={identifier} onAgain={() => setStep("details")} />;
  }

  if (step === "pay") {
    return (
      <PayStep
        summary={`$${finalAmount}`}
        recipient={profile.name}
        payMethod={payMethod}
        setPayMethod={setPayMethod}
        connectError={connect.error}
        busy={connect.busy}
        onBack={() => setStep("details")}
        onContinue={() => void goConfirm()}
      />
    );
  }

  if (step === "confirm") {
    return (
      <form onSubmit={(event) => void onConfirm(event)} className="space-y-5">
        <AmountHero amount={`$${finalAmount}`} />
        {wallet ? <WalletPill address={wallet} /> : null}

        <Fieldset legend="Token & network">
          <TokenSelect
            value={picked?.asset ?? asset}
            onChange={(next) => {
              if (tokens.some((item) => item.asset === next)) setAsset(next as OnceAsset);
            }}
            options={tokens.map((item) => {
              const row = balances.rows.find((entry) => entry.asset === item.asset);
              const bal = row ? ` · ${row.balance}` : balances.loading ? " · …" : "";
              return { value: item.asset, label: `${item.label} · ${item.network}${bal}` };
            })}
          />
          {held ? (
            <p className={`mt-1.5 text-xs ${shortfall ? "text-[#b42318]" : "text-[#5C6572]"}`}>
              Balance {held.balance} {held.label}
            </p>
          ) : balances.loading ? (
            <p className="mt-1.5 text-xs text-[#5C6572]">Loading balances…</p>
          ) : null}
        </Fieldset>

        {config.messagesOk ? (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[#141414]">Message</span>
            <textarea
              name="message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={280}
              rows={2}
              placeholder="Thanks for your support!"
              className="w-full rounded-2xl border border-[#E6EADF] bg-white px-4 py-3 text-sm outline-none focus:border-[#141414]"
            />
          </label>
        ) : null}

        {config.anonymousOk ? (
          <label className="flex min-h-11 items-center gap-2.5 text-sm text-[#141414]">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(event) => setAnonymous(event.target.checked)}
              className="size-4 rounded border-[#E6EADF]"
            />
            Contribute anonymously
          </label>
        ) : null}

        <input type="hidden" name="identifier" value={identifier} />
        <input type="hidden" name="asset" value={asset} />
        <input type="hidden" name="amount" value={finalAmount} />
        {anonymous ? <input type="hidden" name="anonymous" value="on" /> : null}

        <ErrorNote error={state?.error || connect.error || shortMsg} />
        <div className="flex gap-2">
          <SecondaryButton label="Back" onClick={() => setStep("pay")} disabled={pending || connect.busy} />
          <PrimaryButton pending={pending || connect.busy} disabled={!amountReady || shortfall} label="Confirm contribution" />
        </div>
        <p className="text-center text-xs text-[#5C6572]">Secure contribution · Powered by Rvess</p>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <Fieldset legend="Amount">
        <div className="flex flex-wrap gap-2">
          {config.oncePresets.map((preset) => (
            <Chip
              key={preset}
              active={!custom && amount === preset}
              onClick={() => {
                setAmount(preset);
                setCustom("");
              }}
              label={`$${preset}`}
            />
          ))}
        </div>
        <div className="relative mt-2">
          <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[#5C6572]">$</span>
          <input
            inputMode="decimal"
            placeholder="Custom amount"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            className="h-12 w-full rounded-2xl border border-[#E6EADF] bg-white py-0 pr-4 pl-8 text-base outline-none focus:border-[#141414]"
          />
        </div>
        <p className="mt-1.5 text-xs text-[#5C6572]">
          Min ${min}
          {config.onceMax ? ` · Max $${config.onceMax}` : null}
        </p>
      </Fieldset>

      <PrimaryButton type="button" pending={false} disabled={!amountReady} label="Continue" onClick={() => void goPay()} />
      <p className="text-center text-xs text-[#5C6572]">External wallet only · Passkeys are not used here</p>
    </div>
  );
}

function StreamForm({
  identifier,
  profile,
  config,
  wallet,
  setWallet,
  connect,
  startDone,
}: {
  identifier: string;
  profile: PublicReceiveProfile;
  config: ReceiveLinkConfig;
  wallet: string | null;
  setWallet: (value: string | null) => void;
  connect: ReturnType<typeof useReceiveConnect>;
  startDone?: boolean;
}) {
  const fixed = config.streamMode === "fixed";
  const flexible = config.streamMode === "flexible";
  const [step, setStep] = useState<Step>(startDone ? "done" : "details");
  const [payMethod, setPayMethod] = useState<PayMethod>("wallet");
  const [rate, setRate] = useState(fixed ? config.streamAmount : config.streamAmounts[0] ?? config.streamAmount);
  const [customRate, setCustomRate] = useState("");
  const [frequency, setFrequency] = useState<StreamFrequency>(
    fixed ? config.streamFrequency : config.streamFrequencies[0] ?? "monthly",
  );
  const [durationDays, setDurationDays] = useState(fixed ? config.streamDurationDays : config.streamDurations[0] ?? 30);
  const [pay, setPay] = useState<(typeof streamPayOptions)[number]>(streamPayOptions[0]);
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const balances = useBalances(
    wallet,
    streamPayOptions.map((item) => item.asset),
  );
  const [state, action, pending] = useSignedAction(contributeStream, {
    art: "/marks/flow.png",
    title: "Starting stream",
    onSuccess: () => setStep("done"),
  });

  useEffect(() => {
    if (!balances.rows.length) return;
    setPay((current) => {
      const funded = streamPayOptions
        .map((option) => ({ option, bal: moneyOf(balances.rows.find((row) => row.asset === option.asset)?.balance ?? "0") }))
        .filter((row) => row.bal > 0)
        .sort((a, b) => b.bal - a.bal);
      if (!funded.length) return current;
      if (funded.some((row) => row.option.asset === current.asset)) return current;
      return (
        funded.find((row) => row.option.asset === "base-usdc")?.option ??
        funded.find((row) => row.option.asset === "celo-usdc")?.option ??
        funded.find((row) => row.option.pay === "gdx")?.option ??
        funded[0].option
      );
    });
  }, [balances.rows]);

  const finalRate = fixed ? config.streamAmount : customRate.trim() || rate;
  const finalFrequency = fixed ? config.streamFrequency : frequency;
  const finalDays = fixed ? config.streamDurationDays : durationDays;
  const commitment = useMemo(
    () => streamCommitment(finalRate, finalFrequency, finalDays),
    [finalRate, finalFrequency, finalDays],
  );
  const needEstimate = useMemo(
    () => streamNeedEstimate(finalRate, finalFrequency, finalDays),
    [finalRate, finalFrequency, finalDays],
  );
  const frequencies = fixed
    ? [config.streamFrequency]
    : flexible
      ? config.streamFrequencies
      : (["daily", "weekly", "monthly"] as StreamFrequency[]);
  const durations = fixed ? [config.streamDurationDays] : flexible ? config.streamDurations : [7, 30, 90];
  const amounts = fixed ? [config.streamAmount] : flexible ? config.streamAmounts : config.streamAmounts;
  const rateReady = moneyOk(finalRate);
  const held = balances.rows.find((row) => row.asset === pay.asset);
  const balance = held?.balance ?? null;
  const have = balance === null ? null : moneyOf(balance);
  const shortfall = pay.pay !== "gdx" && have !== null && rateReady && have + 1e-9 < needEstimate;
  const shortMsg =
    shortfall
      ? `This account has ${formatMoney(have!)} ${pay.label}. This needs ${formatMoney(needEstimate)} ${pay.label}.`
      : "";

  async function goConfirm() {
    if (payMethod !== "wallet") return;
    let address = wallet;
    if (!address) {
      address = await connect.connect();
      if (!address) return;
      setWallet(address);
    }
    setStep("confirm");
  }

  async function onConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (shortfall) return;
    if (!wallet) {
      const address = await connect.connect();
      if (!address) return;
      setWallet(address);
    }
    action(new FormData(event.currentTarget));
  }

  if (step === "done") {
    return <SuccessCard kind="stream" profile={profile} identifier={identifier} onAgain={() => setStep("details")} />;
  }

  if (step === "pay") {
    return (
      <PayStep
        summary={`$${finalRate} / ${frequencyLabel(finalFrequency).toLowerCase()}`}
        recipient={profile.name}
        payMethod={payMethod}
        setPayMethod={setPayMethod}
        connectError={connect.error}
        busy={connect.busy}
        onBack={() => setStep("details")}
        onContinue={() => void goConfirm()}
      />
    );
  }

  if (step === "confirm") {
    return (
      <form onSubmit={(event) => void onConfirm(event)} className="space-y-5">
        <AmountHero
          amount={`$${finalRate}`}
          hint={`${frequencyLabel(finalFrequency)} · ${finalDays} days · ~$${commitment} total`}
        />
        {wallet ? <WalletPill address={wallet} /> : null}

        <Fieldset legend="Token & network">
          <TokenSelect
            value={`${pay.pay}:${pay.network}`}
            onChange={(next) => {
              const found = streamPayOptions.find((item) => `${item.pay}:${item.network}` === next);
              if (found) setPay(found);
            }}
            options={streamPayOptions.map((item) => {
              const row = balances.rows.find((entry) => entry.asset === item.asset);
              const bal = row ? ` · ${row.balance}` : balances.loading ? " · …" : "";
              return {
                value: `${item.pay}:${item.network}`,
                label: `${item.label} · ${item.network === "celo" ? "Celo" : "Base"}${bal}`,
              };
            })}
          />
          {held ? (
            <p className={`mt-1.5 text-xs ${shortfall ? "text-[#b42318]" : "text-[#5C6572]"}`}>
              Balance {held.balance} {held.label}
              {pay.pay !== "gdx" ? ` · needs ~${formatMoney(needEstimate)} incl. stream deposit` : null}
            </p>
          ) : balances.loading ? (
            <p className="mt-1.5 text-xs text-[#5C6572]">Loading balances…</p>
          ) : null}
        </Fieldset>

        {config.messagesOk ? (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[#141414]">Message</span>
            <textarea
              name="message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={280}
              rows={2}
              placeholder="Thanks for your support!"
              className="w-full rounded-2xl border border-[#E6EADF] bg-white px-4 py-3 text-sm outline-none focus:border-[#141414]"
            />
          </label>
        ) : null}

        {config.anonymousOk ? (
          <label className="flex min-h-11 items-center gap-2.5 text-sm text-[#141414]">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(event) => setAnonymous(event.target.checked)}
              className="size-4 rounded border-[#E6EADF]"
            />
            Contribute anonymously
          </label>
        ) : null}

        <input type="hidden" name="identifier" value={identifier} />
        <input type="hidden" name="rate" value={finalRate} />
        <input type="hidden" name="frequency" value={finalFrequency} />
        <input type="hidden" name="durationDays" value={finalDays} />
        <input type="hidden" name="pay" value={pay.pay} />
        <input type="hidden" name="network" value={pay.network} />
        {anonymous ? <input type="hidden" name="anonymous" value="on" /> : null}

        <ErrorNote error={state?.error || connect.error || shortMsg} />
        <div className="flex gap-2">
          <SecondaryButton label="Back" onClick={() => setStep("pay")} disabled={pending || connect.busy} />
          <PrimaryButton pending={pending || connect.busy} disabled={!rateReady || shortfall} label="Confirm contribution" />
        </div>
        <p className="text-center text-xs text-[#5C6572]">Secure contribution · Powered by Rvess</p>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <Fieldset legend={fixed ? "Amount (set by recipient)" : "Amount"} disabled={fixed}>
        <div className="flex flex-wrap gap-2">
          {amounts.map((preset) => (
            <Chip
              key={preset}
              active={!customRate && rate === preset}
              onClick={() => {
                setRate(preset);
                setCustomRate("");
              }}
              label={`$${preset}`}
            />
          ))}
        </div>
        {!fixed && !flexible ? (
          <div className="relative mt-2">
            <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[#5C6572]">$</span>
            <input
              inputMode="decimal"
              placeholder="Custom amount"
              value={customRate}
              onChange={(event) => setCustomRate(event.target.value)}
              className="h-12 w-full rounded-2xl border border-[#E6EADF] bg-white py-0 pr-4 pl-8 text-base outline-none focus:border-[#141414]"
            />
          </div>
        ) : null}
      </Fieldset>

      <Fieldset legend="Frequency" disabled={fixed}>
        <div className="flex flex-wrap gap-2">
          {frequencies.map((item) => (
            <Chip key={item} active={finalFrequency === item} onClick={() => setFrequency(item)} label={frequencyLabel(item)} />
          ))}
        </div>
      </Fieldset>

      <Fieldset legend="Duration" disabled={fixed}>
        <div className="flex flex-wrap gap-2">
          {durations.map((days) => (
            <Chip key={days} active={finalDays === days} onClick={() => setDurationDays(days)} label={`${days} days`} />
          ))}
        </div>
      </Fieldset>

      {rateReady ? (
        <p className="text-xs text-[#5C6572]">
          About ${commitment} streamed · wallet needs ~${formatMoney(needEstimate)} incl. deposit buffer
        </p>
      ) : null}

      <PrimaryButton type="button" pending={false} disabled={!rateReady} label="Continue" onClick={() => setStep("pay")} />
      <p className="text-center text-xs text-[#5C6572]">External wallet only · Passkeys are not used here</p>
    </div>
  );
}

function PayStep({
  summary,
  recipient,
  payMethod,
  setPayMethod,
  connectError,
  busy,
  onBack,
  onContinue,
}: {
  summary: string;
  recipient: string;
  payMethod: PayMethod;
  setPayMethod: (value: PayMethod) => void;
  connectError: string;
  busy: boolean;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-[#F3F7E8] px-4 py-3 text-sm">
        <p className="font-semibold text-[#141414]">{summary}</p>
        <p className="mt-0.5 text-[#5C6572]">To {recipient}</p>
      </div>

      <Fieldset legend="How do you want to pay?">
        <div className="space-y-2">
          <PayOption
            selected={payMethod === "wallet"}
            onSelect={() => setPayMethod("wallet")}
            icon={<Wallet className="size-5" />}
            title="Wallet"
            body="Connect an injected wallet or WalletConnect"
            enabled
          />
          <PayOption
            selected={false}
            onSelect={() => undefined}
            icon={<Smartphone className="size-5" />}
            title="Mobile money"
            body="Coming soon"
            enabled={false}
          />
          <PayOption
            selected={false}
            onSelect={() => undefined}
            icon={<CreditCard className="size-5" />}
            title="Card"
            body="Coming soon"
            enabled={false}
          />
        </div>
      </Fieldset>

      <ErrorNote error={connectError} />
      <div className="flex gap-2">
        <SecondaryButton label="Back" onClick={onBack} disabled={busy} />
        <PrimaryButton
          type="button"
          pending={busy}
          disabled={payMethod !== "wallet"}
          label={busy ? "Connecting…" : "Continue"}
          onClick={onContinue}
        />
      </div>
    </div>
  );
}

function SuccessCard({
  kind,
  profile,
  identifier,
  onAgain,
}: {
  kind: "once" | "stream";
  profile: PublicReceiveProfile;
  identifier: string;
  onAgain: () => void;
}) {
  const path = `/r/${encodeURIComponent(identifier)}`;
  return (
    <div className="space-y-5 py-2 text-center">
      <div className="mx-auto grid size-16 place-items-center rounded-full bg-[#E7F4C4] text-[#2F6B2F] ring-4 ring-[#D6F34A]/40">
        <Check className="size-8" strokeWidth={2.5} />
      </div>
      <ProfileAvatar seed={profile.address} className="mx-auto size-12" />
      <div>
        <h3 className="text-[1.25rem] font-semibold tracking-[-0.04em] text-[#141414]">
          {kind === "stream" ? "Stream started successfully!" : "Contribution successful!"}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-[#5C6572]">
          Thank you for supporting {profile.name || truncateAddress(profile.address)}.
        </p>
      </div>
      <PrimaryButton type="button" pending={false} label="Contribute again" onClick={onAgain} />
      <div className="flex flex-col items-center gap-2 text-sm">
        <Link href={path} className="font-semibold text-[#141414] underline-offset-4 hover:underline">
          View profile
        </Link>
        <Link href="/" className="text-[#5C6572] underline-offset-4 hover:underline">
          Back to home
        </Link>
      </div>
    </div>
  );
}

function AmountHero({ amount, hint }: { amount: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-[#F3F7E8] px-4 py-5 text-center">
      <p className="text-[2rem] font-semibold tracking-[-0.05em] text-[#141414]">{amount}</p>
      {hint ? <p className="mt-1 text-xs text-[#5C6572]">{hint}</p> : null}
    </div>
  );
}

function WalletPill({ address }: { address: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-[#E6EADF] bg-[#F7F6F3] px-4 py-2.5 text-sm">
      <span className="text-[#5C6572]">Wallet</span>
      <span className="font-mono text-xs font-medium text-[#141414]">{truncateAddress(address)}</span>
    </div>
  );
}

function PayOption({
  selected,
  onSelect,
  icon,
  title,
  body,
  enabled,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: ReactNode;
  title: string;
  body: string;
  enabled: boolean;
}) {
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${
        enabled
          ? selected
            ? "border-[#141414]/20 bg-[#D6F34A]/40"
            : "border-[#E6EADF] bg-white hover:bg-[#F7F6F3]"
          : "cursor-not-allowed border-[#E6EADF] bg-[#F7F6F3] opacity-55"
      }`}
    >
      <span className="mt-0.5 text-[#141414]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#141414]">{title}</span>
          {!enabled ? (
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[#5C6572] uppercase">
              Soon
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-xs text-[#5C6572]">{body}</span>
      </span>
    </button>
  );
}

function Fieldset({
  legend,
  children,
  disabled,
}: {
  legend: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium text-[#141414]">{legend}</legend>
      {children}
    </fieldset>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-10 rounded-full px-3.5 text-sm font-semibold transition ${
        active ? "bg-[#D6F34A] text-[#141414]" : "bg-[#F7F6F3] text-[#141414] hover:bg-[#F3F1EA]"
      }`}
    >
      {label}
    </button>
  );
}

function TokenSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full appearance-none rounded-2xl border border-[#E6EADF] bg-white px-4 pr-10 text-sm font-medium text-[#141414] outline-none focus:border-[#141414]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-[#5C6572]" />
    </div>
  );
}

function PrimaryButton({
  pending,
  disabled,
  label,
  type = "submit",
  onClick,
}: {
  pending: boolean;
  disabled?: boolean;
  label: string;
  type?: "submit" | "button";
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={pending || disabled}
      onClick={onClick}
      className="flex h-12 w-full flex-1 items-center justify-center rounded-full bg-[#D6F34A] text-base font-semibold text-[#141414] transition hover:bg-[#c9ea38] disabled:opacity-50"
    >
      {pending ? "Working…" : label}
    </button>
  );
}

function SecondaryButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-12 shrink-0 items-center justify-center rounded-full border border-[#E6EADF] bg-white px-5 text-sm font-semibold text-[#141414] transition hover:bg-[#F7F6F3] disabled:opacity-50"
    >
      {label}
    </button>
  );
}
