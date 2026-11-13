"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useSignedAction } from "@/components/sign-action";
import { ErrorNote } from "@/components/ui-bits";
import { CopyAddress } from "@/components/receive/copy-address";
import { useReceiveConnect } from "@/components/receive/receive-connect";
import { TokenIcon } from "@/components/token-icon";
import { contributeOnce, contributeStream } from "@/lib/actions";
import {
  frequencyLabel,
  moneyOk,
  streamCommitment,
  type ReceiveLinkConfig,
  type StreamFrequency,
} from "@/lib/receive-link";
import type { PublicReceiveProfile } from "@/lib/receive-resolve";

type Mode = "once" | "stream";

const onceTokenOptions = [
  { asset: "base-usdc", label: "USDC", network: "Base" },
  { asset: "base-usdt", label: "USDT", network: "Base" },
  { asset: "celo-usdc", label: "USDC", network: "Celo" },
  { asset: "celo-usdt", label: "USDT", network: "Celo" },
] as const;

const streamPayOptions = [
  { pay: "usdc", label: "USDC", network: "base" as const },
  { pay: "usdt", label: "USDT", network: "base" as const },
  { pay: "gdx", label: "G$", network: "celo" as const },
] as const;

export function ReceiveCheckout({
  identifier,
  profile,
  config,
  payTo,
  viewerAddress,
}: {
  identifier: string;
  profile: PublicReceiveProfile;
  config: ReceiveLinkConfig;
  payTo: string;
  viewerAddress?: string | null;
}) {
  const both = config.onceEnabled && config.streamEnabled;
  const [mode, setMode] = useState<Mode>(config.onceEnabled ? "once" : "stream");
  const connect = useReceiveConnect();

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
            viewerAddress={viewerAddress}
            connect={connect}
          />
        ) : null}
        {mode === "stream" && config.streamEnabled ? (
          <StreamForm
            identifier={identifier}
            profile={profile}
            config={config}
            payTo={payTo}
            viewerAddress={viewerAddress}
            connect={connect}
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
  payTo,
  viewerAddress,
  connect,
}: {
  identifier: string;
  profile: PublicReceiveProfile;
  config: ReceiveLinkConfig;
  payTo: string;
  viewerAddress?: string | null;
  connect: ReturnType<typeof useReceiveConnect>;
}) {
  const tokens = onceTokenOptions.filter((item) => config.tokens.includes(item.asset) || config.tokens.length === 0);
  const [asset, setAsset] = useState(tokens[0]?.asset ?? "base-usdc");
  const [amount, setAmount] = useState(config.oncePresets[0] ?? "10");
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [state, action, pending] = useSignedAction(contributeOnce, {
    art: "/marks/receive.png",
    title: "Sending contribution",
  });
  const picked = tokens.find((item) => item.asset === asset) ?? tokens[0];
  const finalAmount = custom.trim() || amount;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!viewerAddress) {
      const ok = await connect.connect();
      if (!ok) return;
    }
    action(new FormData(event.currentTarget));
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-5">
      <input type="hidden" name="identifier" value={identifier} />
      <input type="hidden" name="asset" value={asset} />
      <input type="hidden" name="amount" value={finalAmount} />
      {anonymous ? <input type="hidden" name="anonymous" value="on" /> : null}

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
        {(config.onceMin || config.onceMax) && (
          <p className="mt-1.5 text-xs text-[#5C6572]">
            {config.onceMin ? `Min $${config.onceMin}` : null}
            {config.onceMin && config.onceMax ? " · " : null}
            {config.onceMax ? `Max $${config.onceMax}` : null}
          </p>
        )}
      </Fieldset>

      <Fieldset legend="Token & network">
        <div className="grid gap-2">
          {tokens.map((item) => (
            <TokenRow
              key={item.asset}
              active={asset === item.asset}
              onClick={() => setAsset(item.asset)}
              label={item.label}
              network={item.network}
            />
          ))}
        </div>
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

      <Details
        rows={[
          { label: "Recipient", value: profile.name },
          { label: "Wallet", value: <CopyAddress address={payTo} /> },
          { label: "Amount", value: `$${finalAmount || "—"}` },
          { label: "Token", value: picked ? `${picked.label} · ${picked.network}` : "—" },
          { label: "Protocol fees", value: "None on transfer" },
          { label: "Total payable", value: `$${finalAmount || "—"}` },
        ]}
      />

      <ErrorNote error={state?.error || connect.error} />
      <PrimaryButton
        pending={pending || connect.busy}
        disabled={!moneyOk(finalAmount)}
        label={viewerAddress ? "Send contribution" : "Connect & send"}
      />
      <p className="text-center text-xs text-[#5C6572]">Secure transaction · Powered by Rvess</p>
    </form>
  );
}

function StreamForm({
  identifier,
  profile,
  config,
  payTo,
  viewerAddress,
  connect,
}: {
  identifier: string;
  profile: PublicReceiveProfile;
  config: ReceiveLinkConfig;
  payTo: string;
  viewerAddress?: string | null;
  connect: ReturnType<typeof useReceiveConnect>;
}) {
  const fixed = config.streamMode === "fixed";
  const flexible = config.streamMode === "flexible";
  const [rate, setRate] = useState(fixed ? config.streamAmount : config.streamAmounts[0] ?? config.streamAmount);
  const [customRate, setCustomRate] = useState("");
  const [frequency, setFrequency] = useState<StreamFrequency>(
    fixed ? config.streamFrequency : config.streamFrequencies[0] ?? "monthly",
  );
  const [durationDays, setDurationDays] = useState(fixed ? config.streamDurationDays : config.streamDurations[0] ?? 30);
  const [pay, setPay] = useState<(typeof streamPayOptions)[number]>(streamPayOptions[0]);
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [state, action, pending] = useSignedAction(contributeStream, {
    art: "/marks/flow.png",
    title: "Starting stream",
  });

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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!viewerAddress) {
      const ok = await connect.connect();
      if (!ok) return;
    }
    action(new FormData(event.currentTarget));
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-5">
      <input type="hidden" name="identifier" value={identifier} />
      <input type="hidden" name="rate" value={finalRate} />
      <input type="hidden" name="frequency" value={finalFrequency} />
      <input type="hidden" name="durationDays" value={finalDays} />
      <input type="hidden" name="pay" value={pay.pay} />
      <input type="hidden" name="network" value={pay.network} />
      {anonymous ? <input type="hidden" name="anonymous" value="on" /> : null}

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
        <div className="grid gap-2">
          {streamPayOptions.map((item) => (
            <TokenRow
              key={`${item.pay}-${item.network}`}
              active={pay.pay === item.pay && pay.network === item.network}
              onClick={() => setPay(item)}
              label={item.label}
              network={item.network === "celo" ? "Celo" : "Base"}
            />
          ))}
        </div>
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

      <Details
        rows={[
          { label: "Recipient", value: profile.name },
          { label: "Wallet", value: <CopyAddress address={payTo} /> },
          { label: "Stream rate", value: `$${finalRate || "—"} / ${frequencyLabel(finalFrequency).toLowerCase()}` },
          { label: "Duration", value: `${finalDays} days` },
          { label: "Estimated total", value: `$${commitment}` },
          { label: "Token", value: `${pay.label} · ${pay.network === "celo" ? "Celo" : "Base"}` },
          { label: "Upfront deposit", value: "Vault funds the stream (buffer + total)" },
          { label: "Protocol fees", value: "Shown when signing" },
        ]}
      />

      <ErrorNote error={state?.error || connect.error} />
      <PrimaryButton
        pending={pending || connect.busy}
        disabled={!moneyOk(finalRate)}
        label={viewerAddress ? "Start supporting" : "Connect & start"}
      />
      <p className="text-center text-xs text-[#5C6572]">Secure transaction · Powered by Rvess</p>
    </form>
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

function TokenRow({
  active,
  onClick,
  label,
  network,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  network: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left transition ${
        active ? "border-2 border-[#141414] bg-white" : "border border-[#E6EADF] bg-[#F7F6F3]/60 hover:bg-white"
      }`}
    >
      <TokenIcon symbol={label} network={network} className="size-9" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[#141414]">{label}</span>
        <span className="block text-xs text-[#5C6572]">{network}</span>
      </span>
    </button>
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

function PrimaryButton({ pending, disabled, label }: { pending: boolean; disabled?: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="flex h-12 w-full items-center justify-center rounded-full bg-[#D6F34A] text-base font-semibold text-[#141414] transition hover:bg-[#c9ea38] disabled:opacity-50"
    >
      {pending ? "Working…" : label}
    </button>
  );
}
