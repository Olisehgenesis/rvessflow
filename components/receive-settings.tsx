"use client";

import { useState } from "react";
import { useActionState } from "react";
import { CopyButton } from "@/components/copy-button";
import { ErrorNote } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveReceiveSettings, type ActionState } from "@/lib/actions";
import type { ReceiveLinkConfig } from "@/lib/receive-link";

const field = "h-11 rounded-2xl border-border bg-white px-4 text-base shadow-none";

export function ReceiveSettingsForm({
  address,
  memberCode,
  config,
  origin,
}: {
  address: string;
  memberCode: string;
  config: ReceiveLinkConfig;
  origin: string;
}) {
  const [state, action, pending] = useActionState(saveReceiveSettings, null as ActionState);
  const [enabled, setEnabled] = useState(config.enabled);
  const [streamEnabled, setStreamEnabled] = useState(config.streamEnabled);
  const [onceEnabled, setOnceEnabled] = useState(config.onceEnabled);
  const link = `${origin}/r/${memberCode || address}`;

  return (
    <div className="space-y-5">
      <section className="rounded-[1.6rem] border border-[#E6EADF] bg-white p-5">
        <h2 className="text-lg font-semibold tracking-[-0.03em]">Your receive link</h2>
        <p className="mt-1 text-sm text-[#5C6572]">Anyone can open this page without signing in. They can give once or start a stream.</p>
        <p className="mt-3 break-all rounded-2xl bg-[#F3F7E8] px-4 py-3 font-mono text-sm">{link}</p>
        <div className="mt-2">
          <CopyButton value={link} label="Copy link" />
        </div>
        {memberCode ? (
          <p className="mt-3 text-xs text-[#5C6572]">
            Also works as <span className="font-mono">/r/{memberCode}</span> and <span className="font-mono">/r/{address}</span>
          </p>
        ) : (
          <p className="mt-3 text-xs text-[#5C6572]">
            Set a member code in Preferences to get a short username link. Wallet address links always work.
          </p>
        )}
      </section>

      <form action={action} className="space-y-5">
        <section className="space-y-3 rounded-[1.6rem] border border-[#E6EADF] bg-white p-5">
          <h2 className="text-lg font-semibold tracking-[-0.03em]">Contribution types</h2>
          <Toggle name="enabled" checked={enabled} onChange={setEnabled} label="Receive link enabled" />
          <Toggle name="streamEnabled" checked={streamEnabled} onChange={setStreamEnabled} label="Allow Stream" />
          <Toggle name="onceEnabled" checked={onceEnabled} onChange={setOnceEnabled} label="Allow Give once" />
          <Toggle name="anonymousOk" defaultChecked={config.anonymousOk} label="Allow anonymous support" />
          <Toggle name="messagesOk" defaultChecked={config.messagesOk} label="Allow supporter messages" />
        </section>

        <section className="space-y-3 rounded-[1.6rem] border border-[#E6EADF] bg-white p-5">
          <h2 className="text-lg font-semibold tracking-[-0.03em]">Page copy</h2>
          <Field label="Title" name="title" defaultValue={config.title} placeholder="Support what we're building." />
          <label className="block space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              defaultValue={config.description}
              rows={3}
              className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-base"
              placeholder="Your contribution helps us build accessible financial tools for communities."
            />
          </label>
          <Field label="Cover image URL" name="coverUrl" defaultValue={config.coverUrl} placeholder="/receive/cover.jpg" />
          <Field label="Funding goal (USD)" name="fundingGoal" defaultValue={config.fundingGoal} placeholder="Optional" />
          <Field label="Receiving wallet override" name="wallet" defaultValue={config.wallet} placeholder={address} />
        </section>

        <section className="space-y-3 rounded-[1.6rem] border border-[#E6EADF] bg-white p-5">
          <h2 className="text-lg font-semibold tracking-[-0.03em]">Give once</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Minimum" name="onceMin" defaultValue={config.onceMin} />
            <Field label="Maximum" name="onceMax" defaultValue={config.onceMax} placeholder="No max" />
          </div>
          <Field label="Presets (comma-separated)" name="oncePresets" defaultValue={config.oncePresets.join(",")} />
        </section>

        <section className="space-y-3 rounded-[1.6rem] border border-[#E6EADF] bg-white p-5">
          <h2 className="text-lg font-semibold tracking-[-0.03em]">Stream mode</h2>
          <label className="block space-y-1.5">
            <Label htmlFor="streamMode">Mode</Label>
            <select id="streamMode" name="streamMode" defaultValue={config.streamMode} className={field}>
              <option value="fixed">Fixed — supporters use your exact terms</option>
              <option value="flexible">Flexible — choose from your allowed options</option>
              <option value="open">Open — supporters choose within limits</option>
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Fixed / default amount" name="streamAmount" defaultValue={config.streamAmount} />
            <label className="block space-y-1.5">
              <Label htmlFor="streamFrequency">Default frequency</Label>
              <select id="streamFrequency" name="streamFrequency" defaultValue={config.streamFrequency} className={field}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
          </div>
          <Field label="Default duration (days)" name="streamDurationDays" defaultValue={String(config.streamDurationDays)} />
          <Field label="Allowed amounts" name="streamAmounts" defaultValue={config.streamAmounts.join(",")} />
          <Field label="Allowed frequencies" name="streamFrequencies" defaultValue={config.streamFrequencies.join(",")} />
          <Field label="Allowed durations (days)" name="streamDurations" defaultValue={config.streamDurations.join(",")} />
        </section>

        <section className="space-y-3 rounded-[1.6rem] border border-[#E6EADF] bg-white p-5">
          <h2 className="text-lg font-semibold tracking-[-0.03em]">Social links</h2>
          <Field label="Website" name="website" defaultValue={config.socials.website ?? ""} />
          <Field label="X / Twitter" name="twitter" defaultValue={config.socials.twitter ?? ""} />
          <Field label="Farcaster" name="farcaster" defaultValue={config.socials.farcaster ?? ""} />
          <Field label="GitHub" name="github" defaultValue={config.socials.github ?? ""} />
        </section>

        <ErrorNote error={state?.error} />
        {state?.saved ? <p className="text-sm font-medium text-[#2F6B2F]">Saved. Existing streams are unchanged.</p> : null}
        <Button type="submit" disabled={pending} className="h-12 w-full rounded-full text-base">
          {pending ? "Saving…" : "Save receive settings"}
        </Button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={defaultValue} placeholder={placeholder} className={field} />
    </label>
  );
}

function Toggle({
  name,
  label,
  checked,
  defaultChecked,
  onChange,
}: {
  name: string;
  label: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (value: boolean) => void;
}) {
  const controlled = typeof checked === "boolean";
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 rounded-2xl bg-[#F7F6F3] px-4 py-2 text-sm">
      <span>{label}</span>
      <input
        type="checkbox"
        name={name}
        value="on"
        {...(controlled ? { checked, onChange: (event) => onChange?.(event.target.checked) } : { defaultChecked })}
        className="size-4 rounded"
      />
    </label>
  );
}
