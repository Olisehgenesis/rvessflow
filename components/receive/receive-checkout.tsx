"use client";

import { useMemo, useState } from "react";
import { useSignedAction } from "@/components/sign-action";
import { ErrorNote } from "@/components/ui-bits";
import { CopyAddress } from "@/components/receive/copy-address";
import { useReceiveConnect } from "@/components/receive/receive-connect";
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
    <div className="receive-card overflow-hidden p-0">
      <div className="border-b border-[color-mix(in_srgb,#202020_10%,transparent)] px-5 py-4">
        <h2 className="text-lg font-semibold tracking-[-0.03em]">Contribute</h2>
        <p className="mt-1 text-sm text-[color-mix(in_srgb,#202020_58%,transparent)]">
          {mode === "once" ? "Make a single contribution" : "Support continuously with a stream"}
        </p>
      </div>

      {both ? (
        <div className="grid grid-cols-2 gap-1 px-3 pt-3">
          <ModeTab active={mode === "once"} onClick={() => setMode("once")} title="Give once" hint="One-time" />
          <ModeTab active={mode === "stream"} onClick={() => setMode("stream")} title="Stream" hint="Continuous" />
        </div>
      ) : null}

      <div className="px-5 py-4">
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
          <p className="text-sm text-[color-mix(in_srgb,#202020_60%,transparent)]">No contribution options are available.</p>
        ) : null}
      </div>
    </div>
  );
}

function ModeTab({ active, onClick, title, hint }: { active: boolean; onClick: () => void; title: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-2xl px-3 py-3 text-left transition ${
        active ? "bg-[#315CFF] text-white shadow-sm" : "bg-[color-mix(in_srgb,#202020_5%,white)] text-[#202020]"
      }`}
    >
      <span className="block text-sm font-semibold">{title}</span>
      <span className={`block text-xs ${active ? "text-white/80" : "text-[color-mix(in_srgb,#202020_55%,transparent)]"}`}>{hint}</span>
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
  const [state, action, pending] = useSignedAction(contributeOnce, { art: "/receive/success.jpg", title: "Sending contribution" });
  const picked = tokens.find((item) => item.asset === asset) ?? tokens[0];
  const finalAmount = custom.trim() || amount;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!viewerAddress) {
      const ok = await connect.connect();
      if (!ok) return;
    }
    action(new FormData(event.currentTarget));
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
      <input type="hidden" name="identifier" value={identifier} />
      <input type="hidden" name="asset" value={asset} />
      <input type="hidden" name="amount" value={finalAmount} />
      {anonymous ? <input type="hidden" name="anonymous" value="on" /> : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Amount</legend>
        <div className="flex flex-wrap gap-2">
          {config.oncePresets.map((preset) => (
            <PresetChip
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
        <label className="block">
          <span className="sr-only">Custom amount</span>
          <input
            inputMode="decimal"
            placeholder="Custom amount"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            className="h-12 w-full rounded-2xl border border-[color-mix(in_srgb,#202020_12%,transparent)] bg-white px-4 text-base outline-none focus:border-[#315CFF]"
          />
        </label>
        {(config.onceMin || config.onceMax) && (
          <p className="text-xs text-[color-mix(in_srgb,#202020_55%,transparent)]">
            {config.onceMin ? `Min $${config.onceMin}` : null}
            {config.onceMin && config.onceMax ? " · " : null}
            {config.onceMax ? `Max $${config.onceMax}` : null}
          </p>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Token & network</legend>
        <div className="grid gap-2">
          {tokens.map((item) => (
            <button
              key={item.asset}
              type="button"
              aria-pressed={asset === item.asset}
              onClick={() => setAsset(item.asset)}
              className={`flex items-center justify-between rounded-2xl px-3 py-3 text-left ${
                asset === item.asset ? "border-2 border-[#202020] bg-white" : "border border-[color-mix(in_srgb,#202020_10%,transparent)] bg-white/70"
              }`}
            >
              <span className="text-sm font-semibold">{item.label}</span>
              <span className="text-xs text-[color-mix(in_srgb,#202020_55%,transparent)]">{item.network}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {config.messagesOk ? (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Message (optional)</span>
          <textarea
            name="message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={280}
            rows={2}
            className="w-full rounded-2xl border border-[color-mix(in_srgb,#202020_12%,transparent)] bg-white px-4 py-3 text-sm outline-none focus:border-[#315CFF]"
            placeholder="Say something kind"
          />
        </label>
      ) : null}

      {config.anonymousOk ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} className="size-4 rounded" />
          Contribute anonymously
        </label>
      ) : null}

      <Summary
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
      <p className="text-center text-xs text-[color-mix(in_srgb,#202020_50%,transparent)]">Secure transaction · Powered by Rvess</p>
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
  const [frequency, setFrequency] = useState<StreamFrequency>(fixed ? config.streamFrequency : config.streamFrequencies[0] ?? "monthly");
  const [durationDays, setDurationDays] = useState(fixed ? config.streamDurationDays : config.streamDurations[0] ?? 30);
  const [pay, setPay] = useState<(typeof streamPayOptions)[number]>(streamPayOptions[0]);
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [state, action, pending] = useSignedAction(contributeStream, { art: "/receive/success.jpg", title: "Starting stream" });

  const finalRate = fixed ? config.streamAmount : customRate.trim() || rate;
  const finalFrequency = fixed ? config.streamFrequency : frequency;
  const finalDays = fixed ? config.streamDurationDays : durationDays;
  const commitment = useMemo(() => streamCommitment(finalRate, finalFrequency, finalDays), [finalRate, finalFrequency, finalDays]);
  const frequencies = fixed ? [config.streamFrequency] : flexible ? config.streamFrequencies : (["daily", "weekly", "monthly"] as StreamFrequency[]);
  const durations = fixed ? [config.streamDurationDays] : flexible ? config.streamDurations : [7, 30, 90];
  const amounts = fixed ? [config.streamAmount] : flexible ? config.streamAmounts : config.streamAmounts;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!viewerAddress) {
      const ok = await connect.connect();
      if (!ok) return;
    }
    action(new FormData(event.currentTarget));
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
      <input type="hidden" name="identifier" value={identifier} />
      <input type="hidden" name="rate" value={finalRate} />
      <input type="hidden" name="frequency" value={finalFrequency} />
      <input type="hidden" name="durationDays" value={finalDays} />
      <input type="hidden" name="pay" value={pay.pay} />
      <input type="hidden" name="network" value={pay.network} />
      {anonymous ? <input type="hidden" name="anonymous" value="on" /> : null}

      <fieldset className="space-y-2" disabled={fixed}>
        <legend className="text-sm font-medium">Amount {fixed ? "(set by recipient)" : ""}</legend>
        <div className="flex flex-wrap gap-2">
          {amounts.map((preset) => (
            <PresetChip
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
            className="h-12 w-full rounded-2xl border border-[color-mix(in_srgb,#202020_12%,transparent)] bg-white px-4 text-base outline-none focus:border-[#315CFF]"
          />
        ) : null}
      </fieldset>

      <fieldset className="space-y-2" disabled={fixed}>
        <legend className="text-sm font-medium">Frequency</legend>
        <div className="flex flex-wrap gap-2">
          {frequencies.map((item) => (
            <PresetChip key={item} active={finalFrequency === item} onClick={() => setFrequency(item)} label={frequencyLabel(item)} />
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2" disabled={fixed}>
        <legend className="text-sm font-medium">Duration</legend>
        <div className="flex flex-wrap gap-2">
          {durations.map((days) => (
            <PresetChip key={days} active={finalDays === days} onClick={() => setDurationDays(days)} label={`${days} days`} />
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Payment token</legend>
        <div className="grid gap-2">
          {streamPayOptions.map((item) => (
            <button
              key={`${item.pay}-${item.network}`}
              type="button"
              aria-pressed={pay.pay === item.pay && pay.network === item.network}
              onClick={() => setPay(item)}
              className={`flex items-center justify-between rounded-2xl px-3 py-3 text-left ${
                pay.pay === item.pay && pay.network === item.network
                  ? "border-2 border-[#202020] bg-white"
                  : "border border-[color-mix(in_srgb,#202020_10%,transparent)] bg-white/70"
              }`}
            >
              <span className="text-sm font-semibold">{item.label}</span>
              <span className="text-xs text-[color-mix(in_srgb,#202020_55%,transparent)]">{item.network === "celo" ? "Celo" : "Base"}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {config.messagesOk ? (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Message (optional)</span>
          <textarea
            name="message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={280}
            rows={2}
            className="w-full rounded-2xl border border-[color-mix(in_srgb,#202020_12%,transparent)] bg-white px-4 py-3 text-sm outline-none focus:border-[#315CFF]"
          />
        </label>
      ) : null}

      {config.anonymousOk ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} className="size-4 rounded" />
          Support anonymously
        </label>
      ) : null}

      <Summary
        rows={[
          { label: "Recipient", value: profile.name },
          { label: "Wallet", value: <CopyAddress address={payTo} /> },
          { label: "Stream rate", value: `$${finalRate || "—"} / ${frequencyLabel(finalFrequency).toLowerCase()}` },
          { label: "Duration", value: `${finalDays} days` },
          { label: "Estimated total", value: `$${commitment}` },
          { label: "Token", value: `${pay.label} · ${pay.network === "celo" ? "Celo" : "Base"}` },
          { label: "Upfront deposit", value: "Vault funds the stream (buffer + total)" },
          { label: "Protocol fees", value: "Shown in wallet when signing" },
        ]}
      />

      <ErrorNote error={state?.error || connect.error} />
      <PrimaryButton
        pending={pending || connect.busy}
        disabled={!moneyOk(finalRate)}
        label={viewerAddress ? "Start supporting" : "Connect & start"}
      />
      <p className="text-center text-xs text-[color-mix(in_srgb,#202020_50%,transparent)]">Secure transaction · Powered by Rvess</p>
    </form>
  );
}

function PresetChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3.5 py-2 text-sm font-semibold ${
        active ? "bg-[#F47B35] text-white" : "bg-[color-mix(in_srgb,#202020_6%,white)] text-[#202020]"
      }`}
    >
      {label}
    </button>
  );
}

function Summary({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="rounded-2xl bg-[color-mix(in_srgb,#315CFF_7%,white)] px-4 py-3 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex items-start justify-between gap-3 py-1.5">
          <dt className="text-[color-mix(in_srgb,#202020_55%,transparent)]">{row.label}</dt>
          <dd className="text-right font-medium">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PrimaryButton({ pending, disabled, label }: { pending: boolean; disabled?: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="flex h-12 w-full items-center justify-center rounded-full bg-[#315CFF] text-base font-semibold text-white disabled:opacity-50"
    >
      {pending ? "Working…" : label}
    </button>
  );
}
