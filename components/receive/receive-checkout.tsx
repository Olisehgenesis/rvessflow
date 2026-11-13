"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ChevronDown, CreditCard, Smartphone, Wallet } from "lucide-react";
import { useSignedAction } from "@/components/sign-action";
import { ErrorNote } from "@/components/ui-bits";
import { CopyAddress } from "@/components/receive/copy-address";
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
type Step = "wallet" | "details" | "pay" | "confirm" | "done";
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
  { pay: "gdx", label: "G$", network: "celo" as const, asset: "celo-gdx" },
] as const;

function pickDefaultOnceAsset(tokens: (typeof onceTokenOptions)[number][]): OnceAsset {
  return (
    tokens.find((item) => item.asset === "base-usdc")?.asset ??
    tokens.find((item) => item.label === "USDC")?.asset ??
    tokens[0]?.asset ??
    "base-usdc"
  );
}

function moneyOf(value: string) {
  return Number(value.replace(/,/g, "").trim()) || 0;
}

function pickFundedAsset(tokens: (typeof onceTokenOptions)[number][], rows: BalanceRow[], current: OnceAsset): OnceAsset {
  const funded = tokens
    .map((token) => ({ token, bal: moneyOf(rows.find((row) => row.asset === token.asset)?.balance ?? "0") }))
    .filter((row) => row.bal > 0)
    .sort((a, b) => b.bal - a.bal);
  if (!funded.length) return current;
  if (funded.some((row) => row.token.asset === current)) return current;
  return funded.find((row) => row.token.asset === "base-usdc")?.token.asset
    ?? funded.find((row) => row.token.label === "USDC")?.token.asset
    ?? funded[0].token.asset;
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
            payTo={payTo}
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
            payTo={payTo}
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

function StepDots({ step }: { step: Step }) {
  const order: Step[] = ["wallet", "details", "pay", "confirm", "done"];
  const index = order.indexOf(step);
  const labels = ["Wallet", "Amount", "Pay", "Sign", "Done"];
  return (
    <ol className="mb-5 flex items-center gap-1.5">
      {labels.map((label, i) => {
        const active = i === index;
        const complete = i < index;
        return (
          <li key={label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span
              className={`h-1.5 w-full rounded-full ${active || complete ? "bg-[#D6F34A]" : "bg-[#E6EADF]"}`}
              aria-hidden
            />
            <span className={`text-[11px] ${active ? "font-semibold text-[#141414]" : "text-[#5C6572]"}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function OnceForm({
  identifier,
  profile,
  config,
  payTo,
  wallet,
  setWallet,
  connect,
  startDone,
}: {
  identifier: string;
  profile: PublicReceiveProfile;
  config: ReceiveLinkConfig;
  payTo: string;
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
  const [step, setStep] = useState<Step>(startDone ? "done" : wallet ? "details" : "wallet");
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
    setAsset((current) => pickFundedAsset(tokens, balances.rows, current));
  }, [balances.rows, tokens]);

  const picked = tokens.find((item) => item.asset === asset) ?? tokens.find((item) => item.asset === pickDefaultOnceAsset(tokens)) ?? tokens[0];
  const finalAmount = custom.trim() || amount;
  const min = onceMinimum(config);
  const held = balances.rows.find((row) => row.asset === asset);
  const balance = held?.balance ?? null;
  const amountReady = moneyOk(finalAmount) && Number(finalAmount) >= min;
  const enough = balance === null || moneyOf(finalAmount) <= moneyOf(balance) + 1e-9;
  const shortfall = amountReady && balance !== null && !enough;

  async function ensureWallet() {
    if (wallet) return wallet;
    const address = await connect.connect();
    if (!address) return null;
    setWallet(address);
    return address;
  }

  async function onConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (payMethod !== "wallet") return;
    if (!(await ensureWallet())) return;
    action(new FormData(event.currentTarget));
  }

  if (step === "done") {
    return <SuccessCard kind="once" profile={profile} onAgain={() => setStep(wallet ? "details" : "wallet")} />;
  }

  if (step === "wallet") {
    return (
      <WalletStep
        wallet={wallet}
        connect={connect}
        onConnected={(address) => {
          setWallet(address);
          setStep("details");
        }}
        onContinue={() => setStep("details")}
      />
    );
  }

  if (step === "pay") {
    return (
      <div className="space-y-5">
        <StepDots step={step} />
        <SummaryLine
          amount={`$${finalAmount}`}
          token={picked ? `${picked.label} · ${picked.network}` : "—"}
          recipient={profile.name}
          balance={balance}
        />
        <Fieldset legend="How do you want to pay?">
          <div className="space-y-2">
            <PayOption
              selected={payMethod === "wallet"}
              onSelect={() => setPayMethod("wallet")}
              icon={<Wallet className="size-5" />}
              title="Wallet"
              body="Pay from the connected wallet."
              enabled
            />
            <PayOption
              selected={false}
              onSelect={() => undefined}
              icon={<Smartphone className="size-5" />}
              title="Mobile money"
              body="Coming soon."
              enabled={false}
            />
            <PayOption
              selected={false}
              onSelect={() => undefined}
              icon={<CreditCard className="size-5" />}
              title="Card"
              body="Coming soon."
              enabled={false}
            />
          </div>
        </Fieldset>
        <div className="flex gap-2">
          <SecondaryButton label="Back" onClick={() => setStep("details")} />
          <PrimaryButton
            type="button"
            pending={false}
            disabled={payMethod !== "wallet"}
            label="Continue"
            onClick={() => setStep("confirm")}
          />
        </div>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <form onSubmit={(event) => void onConfirm(event)} className="space-y-5">
        <StepDots step={step} />
        <input type="hidden" name="identifier" value={identifier} />
        <input type="hidden" name="asset" value={asset} />
        <input type="hidden" name="amount" value={finalAmount} />
        {anonymous ? <input type="hidden" name="anonymous" value="on" /> : null}
        {config.messagesOk && message ? <input type="hidden" name="message" value={message} /> : null}

        <SummaryLine
          amount={`$${finalAmount}`}
          token={picked ? `${picked.label} · ${picked.network}` : "—"}
          recipient={profile.name}
          balance={balance}
        />

        <WalletBadge address={wallet} />

        <Details
          rows={[
            { label: "Recipient", value: profile.name },
            { label: "To", value: <CopyAddress address={payTo} /> },
            { label: "Amount", value: `$${finalAmount || "—"}` },
            { label: "Token", value: picked ? `${picked.label} · ${picked.network}` : "—" },
            ...(balance !== null ? [{ label: "Your balance", value: `${balance} ${picked?.label ?? ""}` }] : []),
          ]}
        />

        <ErrorNote error={state?.error || connect.error || (shortfall ? `Not enough ${picked?.label ?? "token"} in this wallet.` : "")} />
        <div className="flex gap-2">
          <SecondaryButton label="Back" onClick={() => setStep("pay")} disabled={pending || connect.busy} />
          <PrimaryButton
            pending={pending || connect.busy}
            disabled={!amountReady || shortfall}
            label="Sign & send"
          />
        </div>
        <p className="text-center text-xs text-[#5C6572]">External wallet only · Passkeys are not used here</p>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <StepDots step={step} />
      <WalletBadge
        address={wallet}
        onChange={() => setStep("wallet")}
      />

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
        <input
          inputMode="decimal"
          placeholder="Custom amount"
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          className="mt-2 h-12 w-full rounded-2xl border border-[#E6EADF] bg-white px-4 text-base outline-none focus:border-[#141414]"
        />
        <p className="mt-1.5 text-xs text-[#5C6572]">
          Min ${min}
          {config.onceMax ? ` · Max $${config.onceMax}` : null}
        </p>
      </Fieldset>

      <Fieldset legend="Token & network">
        <TokenSelect
          value={picked?.asset ?? asset}
          onChange={(next) => {
            if (tokens.some((item) => item.asset === next)) setAsset(next as OnceAsset);
          }}
          options={tokens.map((item) => {
            const row = balances.rows.find((entry) => entry.asset === item.asset);
            const bal = row ? ` · ${row.balance}` : balances.loading ? " · …" : "";
            return {
              value: item.asset,
              label: `${item.label} · ${item.network}${bal}`,
            };
          })}
        />
        {held ? (
          <p className={`mt-1.5 text-xs ${shortfall ? "text-[#b42318]" : "text-[#5C6572]"}`}>
            Balance {held.balance} {held.label}
            {shortfall ? " — not enough for this amount" : null}
          </p>
        ) : balances.loading ? (
          <p className="mt-1.5 text-xs text-[#5C6572]">Loading balances…</p>
        ) : balances.error ? (
          <p className="mt-1.5 text-xs text-[#b42318]">{balances.error}</p>
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
            placeholder="Optional"
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

      <ErrorNote error={shortfall ? `Not enough ${picked?.label ?? "token"} in this wallet.` : ""} />
      <PrimaryButton
        type="button"
        pending={false}
        disabled={!amountReady || shortfall}
        label="Contribute"
        onClick={() => setStep("pay")}
      />
      <p className="text-center text-xs text-[#5C6572]">Secure contribution · Powered by Rvess</p>
    </div>
  );
}

function StreamForm({
  identifier,
  profile,
  config,
  payTo,
  wallet,
  setWallet,
  connect,
  startDone,
}: {
  identifier: string;
  profile: PublicReceiveProfile;
  config: ReceiveLinkConfig;
  payTo: string;
  wallet: string | null;
  setWallet: (value: string | null) => void;
  connect: ReturnType<typeof useReceiveConnect>;
  startDone?: boolean;
}) {
  const fixed = config.streamMode === "fixed";
  const flexible = config.streamMode === "flexible";
  const [step, setStep] = useState<Step>(startDone ? "done" : wallet ? "details" : "wallet");
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
      if (funded.some((row) => row.option.pay === current.pay && row.option.network === current.network)) return current;
      return funded[0].option;
    });
  }, [balances.rows]);

  const finalRate = fixed ? config.streamAmount : customRate.trim() || rate;
  const finalFrequency = fixed ? config.streamFrequency : frequency;
  const finalDays = fixed ? config.streamDurationDays : durationDays;
  const commitment = useMemo(
    () => streamCommitment(finalRate, finalFrequency, finalDays),
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
  const enough = balance === null || moneyOf(commitment) <= moneyOf(balance) + 1e-9;
  const shortfall = rateReady && balance !== null && !enough;

  async function ensureWallet() {
    if (wallet) return wallet;
    const address = await connect.connect();
    if (!address) return null;
    setWallet(address);
    return address;
  }

  async function onConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (payMethod !== "wallet") return;
    if (!(await ensureWallet())) return;
    action(new FormData(event.currentTarget));
  }

  if (step === "done") {
    return <SuccessCard kind="stream" profile={profile} onAgain={() => setStep(wallet ? "details" : "wallet")} />;
  }

  if (step === "wallet") {
    return (
      <WalletStep
        wallet={wallet}
        connect={connect}
        onConnected={(address) => {
          setWallet(address);
          setStep("details");
        }}
        onContinue={() => setStep("details")}
      />
    );
  }

  if (step === "pay") {
    return (
      <div className="space-y-5">
        <StepDots step={step} />
        <SummaryLine
          amount={`$${finalRate} / ${frequencyLabel(finalFrequency).toLowerCase()}`}
          token={`${pay.label} · ${pay.network === "celo" ? "Celo" : "Base"}`}
          recipient={profile.name}
          balance={balance}
        />
        <Fieldset legend="How do you want to pay?">
          <div className="space-y-2">
            <PayOption
              selected={payMethod === "wallet"}
              onSelect={() => setPayMethod("wallet")}
              icon={<Wallet className="size-5" />}
              title="Wallet"
              body="Pay from the connected wallet."
              enabled
            />
            <PayOption
              selected={false}
              onSelect={() => undefined}
              icon={<Smartphone className="size-5" />}
              title="Mobile money"
              body="Coming soon."
              enabled={false}
            />
            <PayOption
              selected={false}
              onSelect={() => undefined}
              icon={<CreditCard className="size-5" />}
              title="Card"
              body="Coming soon."
              enabled={false}
            />
          </div>
        </Fieldset>
        <div className="flex gap-2">
          <SecondaryButton label="Back" onClick={() => setStep("details")} />
          <PrimaryButton
            type="button"
            pending={false}
            disabled={payMethod !== "wallet"}
            label="Continue"
            onClick={() => setStep("confirm")}
          />
        </div>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <form onSubmit={(event) => void onConfirm(event)} className="space-y-5">
        <StepDots step={step} />
        <input type="hidden" name="identifier" value={identifier} />
        <input type="hidden" name="rate" value={finalRate} />
        <input type="hidden" name="frequency" value={finalFrequency} />
        <input type="hidden" name="durationDays" value={finalDays} />
        <input type="hidden" name="pay" value={pay.pay} />
        <input type="hidden" name="network" value={pay.network} />
        {anonymous ? <input type="hidden" name="anonymous" value="on" /> : null}
        {config.messagesOk && message ? <input type="hidden" name="message" value={message} /> : null}

        <SummaryLine
          amount={`$${finalRate} / ${frequencyLabel(finalFrequency).toLowerCase()}`}
          token={`${pay.label} · ${pay.network === "celo" ? "Celo" : "Base"}`}
          recipient={profile.name}
          balance={balance}
        />

        <WalletBadge address={wallet} />

        <Details
          rows={[
            { label: "Recipient", value: profile.name },
            { label: "To", value: <CopyAddress address={payTo} /> },
            { label: "Stream rate", value: `$${finalRate || "—"} / ${frequencyLabel(finalFrequency).toLowerCase()}` },
            { label: "Duration", value: `${finalDays} days` },
            { label: "Estimated total", value: `$${commitment}` },
            { label: "Token", value: `${pay.label} · ${pay.network === "celo" ? "Celo" : "Base"}` },
            ...(balance !== null ? [{ label: "Your balance", value: `${balance} ${pay.label}` }] : []),
          ]}
        />

        <ErrorNote error={state?.error || connect.error || (shortfall ? `Not enough ${pay.label} in this wallet for the estimated total.` : "")} />
        <div className="flex gap-2">
          <SecondaryButton label="Back" onClick={() => setStep("pay")} disabled={pending || connect.busy} />
          <PrimaryButton
            pending={pending || connect.busy}
            disabled={!rateReady || shortfall}
            label="Sign & start"
          />
        </div>
        <p className="text-center text-xs text-[#5C6572]">External wallet only · Passkeys are not used here</p>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <StepDots step={step} />
      <WalletBadge address={wallet} onChange={() => setStep("wallet")} />

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
          <input
            inputMode="decimal"
            placeholder="Custom amount"
            value={customRate}
            onChange={(event) => setCustomRate(event.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-[#E6EADF] bg-white px-4 text-base outline-none focus:border-[#141414]"
          />
        ) : null}
      </Fieldset>

      <Fieldset legend="Frequency" disabled={fixed}>
        <div className="flex flex-wrap gap-2">
          {frequencies.map((item) => (
            <Chip
              key={item}
              active={finalFrequency === item}
              onClick={() => setFrequency(item)}
              label={frequencyLabel(item)}
            />
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
            {shortfall ? " — not enough for the estimated total" : null}
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
            placeholder="Optional"
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
          Support anonymously
        </label>
      ) : null}

      <ErrorNote error={shortfall ? `Not enough ${pay.label} in this wallet for the estimated total.` : ""} />
      <PrimaryButton
        type="button"
        pending={false}
        disabled={!rateReady || shortfall}
        label="Contribute"
        onClick={() => setStep("pay")}
      />
      <p className="text-center text-xs text-[#5C6572]">Secure contribution · Powered by Rvess</p>
    </div>
  );
}

function WalletStep({
  wallet,
  connect,
  onConnected,
  onContinue,
}: {
  wallet: string | null;
  connect: ReturnType<typeof useReceiveConnect>;
  onConnected: (address: string) => void;
  onContinue: () => void;
}) {
  async function connectNow() {
    const address = await connect.connect();
    if (!address) return;
    onConnected(address);
  }

  return (
    <div className="space-y-5">
      <StepDots step="wallet" />
      <div className="rounded-2xl border border-[#E6EADF] bg-[#F3F7E8] px-4 py-5 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-white text-[#141414]">
          <Wallet className="size-6" />
        </div>
        <h3 className="mt-3 text-base font-semibold tracking-[-0.03em] text-[#141414]">Connect a wallet first</h3>
        <p className="mt-1.5 text-sm text-[#5C6572]">
          Injected wallets and WalletConnect. We load your balances so you can pick a token you actually hold.
        </p>
      </div>
      <ErrorNote error={connect.error} />
      {wallet ? (
        <>
          <WalletBadge address={wallet} />
          <PrimaryButton type="button" pending={false} label="Continue" onClick={onContinue} />
        </>
      ) : (
        <PrimaryButton
          type="button"
          pending={connect.busy}
          label={connect.busy ? "Connecting…" : "Connect wallet"}
          onClick={() => void connectNow()}
        />
      )}
      <p className="text-center text-xs text-[#5C6572]">External wallet only · Passkeys are not used here</p>
    </div>
  );
}

function WalletBadge({ address, onChange }: { address: string | null; onChange?: () => void }) {
  if (!address) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#E6EADF] bg-[#F7F6F3] px-4 py-3 text-sm">
      <div>
        <p className="font-medium text-[#141414]">Connected wallet</p>
        <p className="mt-0.5 font-mono text-xs text-[#5C6572]">{truncateAddress(address)}</p>
      </div>
      {onChange ? (
        <button type="button" onClick={onChange} className="text-xs font-semibold text-[#141414] underline-offset-2 hover:underline">
          Change
        </button>
      ) : null}
    </div>
  );
}

function SuccessCard({
  kind,
  profile,
  onAgain,
}: {
  kind: "once" | "stream";
  profile: PublicReceiveProfile;
  onAgain: () => void;
}) {
  return (
    <div className="space-y-4 text-center">
      <StepDots step="done" />
      <div className="mx-auto grid size-14 place-items-center rounded-full bg-[#E7F4C4]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={kind === "stream" ? "/marks/flow.png" : "/marks/receive.png"} alt="" className="size-9 object-contain" />
      </div>
      <ProfileAvatar seed={profile.address} className="mx-auto size-11" />
      <div>
        <h3 className="text-lg font-semibold tracking-[-0.03em] text-[#141414]">
          {kind === "stream" ? `You're supporting ${profile.name}.` : "Contribution sent successfully."}
        </h3>
        <p className="mt-1.5 text-sm text-[#5C6572]">
          {kind === "stream"
            ? "The stream goes live once the wallet confirms."
            : "Thank you — the transfer is complete."}
        </p>
      </div>
      <PrimaryButton type="button" pending={false} label="Contribute again" onClick={onAgain} />
    </div>
  );
}

function SummaryLine({
  amount,
  token,
  recipient,
  balance,
}: {
  amount: string;
  token: string;
  recipient: string;
  balance?: string | null;
}) {
  return (
    <div className="rounded-2xl bg-[#F3F7E8] px-4 py-3 text-sm">
      <p className="font-semibold text-[#141414]">
        {amount} <span className="font-medium text-[#5C6572]">· {token}</span>
      </p>
      <p className="mt-0.5 text-[#5C6572]">To {recipient}</p>
      {balance != null ? <p className="mt-0.5 text-xs text-[#5C6572]">Your balance {balance}</p> : null}
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

function Details({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <details className="group rounded-2xl border border-[#E6EADF] bg-[#F7F6F3] open:bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-[#141414]">
        Transaction details
        <ChevronDown className="size-4 text-[#5C6572] transition group-open:rotate-180" />
      </summary>
      <dl className="border-t border-[#E6EADF] px-4 py-2 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-3 py-1.5">
            <dt className="text-[#5C6572]">{row.label}</dt>
            <dd className="text-right font-medium text-[#141414]">{row.value}</dd>
          </div>
        ))}
      </dl>
    </details>
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
