import Link from "next/link";
import { Camera, ChevronRight, CircleUserRound, Fingerprint, Wallet } from "lucide-react";
import { CopyAddress } from "@/components/copy-address";
import { ProfileAvatar } from "@/components/profile-avatar";
import { SettingsSection } from "@/components/settings-ui";
import { AvatarTick, VerifiedName } from "@/components/verify-badge";
import { shortAddress } from "@/lib/display";
import { networkName } from "@/lib/protocol";
import { currencyByCode } from "@/lib/quote";
import type { SettingsData } from "@/lib/settings-view";
import type { ReactNode } from "react";

function passkeyLabel(view: SettingsData) {
  if (view.who.method === "passkey") return "Passkey verified";
  return view.signLabel;
}

export function IdentityHero({ view, compact = false }: { view: SettingsData; compact?: boolean }) {
  const { who, data, identity, feeNote } = view;
  const unit = networkName === "Celo" ? "CELO" : "ETH";
  return (
    <section
      className={`relative overflow-hidden border border-[#E6EADF] bg-[linear-gradient(180deg,#F3FBE0_0%,#FFFFFF_72%)] shadow-[0_1px_0_rgba(20,20,20,0.04)] ${
        compact ? "rounded-[1.5rem] p-4" : "rounded-[1.7rem] p-5 lg:p-6"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <AvatarTick verified={identity.verified}>
            <ProfileAvatar seed={who.address} className={`${compact ? "size-14" : "size-[4.25rem]"} ring-2 ring-white`} />
          </AvatarTick>
          <div className="min-w-0">
            <p className={`truncate font-[family-name:var(--font-manrope)] font-semibold tracking-[-0.03em] text-[#141414] ${compact ? "text-lg" : "text-[1.45rem]"}`}>
              <VerifiedName name={data.me.name} verified={identity.verified} />
            </p>
            <p className="mt-0.5 font-mono text-[13px] text-[#5C6572]">{shortAddress(data.me.address)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#E7F4C4] px-2.5 py-1 text-[11px] font-medium text-[#141414]">
                {who.method === "passkey" ? <Fingerprint className="size-3" strokeWidth={2} /> : null}
                {passkeyLabel(view)}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-[#3A3F47]">
                <span className="size-1.5 rounded-full bg-[#0052FF]" />
                Base
              </span>
            </div>
          </div>
        </div>
        {compact ? null : (
          <Link
            href="/settings/preferences"
            className="hidden h-9 shrink-0 items-center gap-1.5 rounded-full border border-[#E6EADF] bg-white px-3 text-sm font-medium text-[#141414] sm:inline-flex focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
          >
            Edit profile
          </Link>
        )}
      </div>
      {compact ? (
        <p className="mt-3 text-sm text-[#5C6572]">
          {Number(data.eth).toFixed(4)} {unit} on {networkName}
          {who.method === "passkey" ? ` · This passkey pays the network fee in ${networkName === "Celo" ? "CELO" : "USDC"}.` : ""}
        </p>
      ) : (
        <p className="mt-4 text-sm leading-relaxed text-[#5C6572]">{feeNote}</p>
      )}
    </section>
  );
}

export function AccountSettings({ view }: { view: SettingsData }) {
  const { data, quote, contactHint } = view;
  const unit = networkName === "Celo" ? "CELO" : "ETH";
  const selected = currencyByCode(quote.code);
  return (
    <div className="space-y-4">
      <IdentityHero view={view} />

      <SettingsSection title="Account overview">
        <div className="grid gap-3 sm:grid-cols-3">
          <OverviewTile label="Wallet address" value={shortAddress(data.me.address)}>
            <CopyAddress address={data.me.address} compact />
          </OverviewTile>
          <OverviewTile
            label="Network"
            value="Base"
            hint={
              <span className="mt-2 inline-flex items-center gap-2 text-sm text-[#5C6572]">
                <span className="grid size-3.5 place-items-center rounded-full ring-2 ring-[#0052FF]">
                  <span className="size-2 rounded-full bg-[#0052FF]" />
                </span>
                {networkName === "Base" ? "Connected" : `Savings on ${networkName}`}
              </span>
            }
          />
          <OverviewTile label="Balance" value={`${Number(data.eth).toFixed(4)} ${unit}`} href="/home" />
        </div>
      </SettingsSection>

      <SettingsSection title="Profile information">
        <p className="mb-1 text-sm leading-relaxed text-[#5C6572]">Manage your public profile and personal details.</p>
        <ProfileLine icon={<CircleUserRound className="size-4" strokeWidth={1.75} />} label="Display name" value={data.me.name} />
        <ProfileLine icon={<Wallet className="size-4" strokeWidth={1.75} />} label="How people find you" value={contactHint} href="/settings/preferences" />
        <ProfileLine icon={<Camera className="size-4" strokeWidth={1.75} />} label="Profile picture" value="Generated from this account" />
      </SettingsSection>

      <SettingsSection title="Preferences">
        <p className="mb-1 text-sm leading-relaxed text-[#5C6572]">Customize how Rvess works for you.</p>
        <ProfileLine
          icon={<span className="text-xs font-semibold">$</span>}
          label="Currency"
          value={`${selected.label} (${selected.country})`}
          href="/settings/preferences"
        />
      </SettingsSection>

      <Link
        href="/settings/security"
        className="flex min-h-[4.25rem] items-center justify-between gap-3 rounded-[1.6rem] border border-[#E6EADF] bg-white px-5 py-4 shadow-[0_1px_0_rgba(20,20,20,0.04)]"
      >
        <span>
          <span className="block font-[family-name:var(--font-manrope)] text-lg font-semibold tracking-[-0.03em] text-[#141414]">Wallet & Security</span>
          <span className="mt-0.5 block text-sm text-[#5C6572]">Manage your wallet, passkeys and account security.</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-[#9AA3AE]" strokeWidth={1.75} />
      </Link>
    </div>
  );
}

function ProfileLine({
  icon,
  label,
  value,
  href,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  const body = (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#F3F7E8] text-[#141414]">{icon}</span>
      <span className="min-w-0 flex-1 py-3">
        <span className="block text-sm text-[#5C6572]">{label}</span>
        <span className="mt-0.5 block truncate text-sm font-medium text-[#141414]">{value}</span>
      </span>
      {href ? <ChevronRight className="size-4 shrink-0 text-[#9AA3AE]" strokeWidth={1.75} /> : null}
    </>
  );
  const className = "flex min-h-14 items-center gap-3 border-t border-[#E6EADF]";
  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
}

function OverviewTile({
  label,
  value,
  href,
  hint,
  children,
}: {
  label: string;
  value: string;
  href?: string;
  hint?: ReactNode;
  children?: ReactNode;
}) {
  const className = "rounded-2xl bg-[#F7F8F4] px-4 py-3.5";
  if (href) {
    return (
      <Link href={href} className={`${className} block`}>
        <p className="text-xs font-medium text-[#5C6572]">{label}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-semibold text-[#141414]">{value}</p>
          <ChevronRight className="size-4 shrink-0 text-[#9AA3AE]" strokeWidth={1.75} />
        </div>
      </Link>
    );
  }
  return (
    <div className={className}>
      <p className="text-xs font-medium text-[#5C6572]">{label}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold text-[#141414]">{value}</p>
        {children}
      </div>
      {hint}
    </div>
  );
}
