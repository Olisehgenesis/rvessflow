import Link from "next/link";
import { CopyAddress } from "@/components/copy-address";
import { ProfileAvatar } from "@/components/profile-avatar";
import { SettingsRow, SettingsSection } from "@/components/settings-ui";
import { AvatarTick, VerifiedName } from "@/components/verify-badge";
import { shortAddress } from "@/lib/display";
import { networkName } from "@/lib/protocol";
import type { SettingsData } from "@/lib/settings-view";

export function IdentityHero({ view, compact = false }: { view: SettingsData; compact?: boolean }) {
  const { who, data, identity, signLabel, feeNote } = view;
  return (
    <section className={`overflow-hidden border border-[#E6EADF] bg-[linear-gradient(180deg,#F4FBE3_0%,#FFFFFF_62%)] shadow-[0_1px_0_rgba(20,20,20,0.04)] ${compact ? "rounded-[1.5rem] p-4" : "rounded-[1.7rem] p-5 lg:p-6"}`}>
      <div className="flex items-center gap-3">
        <AvatarTick verified={identity.verified}>
          <ProfileAvatar seed={who.address} className={`${compact ? "size-14" : "size-16"} ring-2 ring-white`} />
        </AvatarTick>
        <div className="min-w-0">
          <p className={`truncate font-[family-name:var(--font-manrope)] font-semibold tracking-[-0.03em] text-[#141414] ${compact ? "text-lg" : "text-xl"}`}>
            <VerifiedName name={data.me.name} verified={identity.verified} />
          </p>
          <p className="mt-0.5 font-mono text-sm text-[#5C6572]">{shortAddress(data.me.address)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-[#E7F4C4] px-2.5 py-1 text-xs font-medium text-[#141414]">{identity.verified ? "Verified" : signLabel}</span>
            <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium text-[#3A3F47]">Base · Celo</span>
          </div>
        </div>
      </div>
      {compact ? (
        <p className="mt-3 text-sm text-[#5C6572]">
          {Number(data.eth).toFixed(4)} {networkName === "Celo" ? "CELO" : "ETH"} · {signLabel}
        </p>
      ) : (
        <p className="mt-4 text-sm leading-relaxed text-[#5C6572]">{feeNote}</p>
      )}
    </section>
  );
}

export function AccountSettings({ view }: { view: SettingsData }) {
  const { data, contactHint } = view;
  const unit = networkName === "Celo" ? "CELO" : "ETH";
  return (
    <div className="space-y-4">
      <IdentityHero view={view} />
      <SettingsSection title="Account overview">
        <div className="grid gap-3 sm:grid-cols-3">
          <OverviewTile label="Wallet address" value={shortAddress(data.me.address)}>
            <CopyAddress address={data.me.address} compact />
          </OverviewTile>
          <OverviewTile label="Network" value={networkName} hint="Account also on Base and Celo" />
          <OverviewTile label="Balance" value={`${Number(data.eth).toFixed(4)} ${unit}`} />
        </div>
      </SettingsSection>
      <SettingsSection title="Profile information">
        <p className="mb-1 text-sm leading-relaxed text-[#5C6572]">Public identity for this account. Discovery details are in Preferences.</p>
        <SettingsRow label="Display name" value={data.me.name} />
        <SettingsRow
          label="How people find you"
          value={<span className="truncate">{contactHint}</span>}
          action={
            <Link href="/settings/preferences" className="text-sm font-medium text-[#141414] underline decoration-[#E6EADF] underline-offset-4">
              Edit
            </Link>
          }
        />
        <SettingsRow label="Profile picture" value="Generated from this account" />
      </SettingsSection>
    </div>
  );
}

function OverviewTile({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-[#F7F8F4] px-4 py-3">
      <p className="text-xs font-medium text-[#5C6572]">{label}</p>
      <div className="mt-1 flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-semibold leading-snug break-words text-[#141414]">{value}</p>
        {children}
      </div>
      {hint ? <p className="mt-1 text-xs leading-snug text-[#5C6572]">{hint}</p> : null}
    </div>
  );
}
