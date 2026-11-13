"use client";

import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { ProfileAvatar } from "@/components/profile-avatar";
import { IconMark } from "@/components/icons";
import { ReceiveCheckout } from "@/components/receive/receive-checkout";
import { ReceiveConnectButton } from "@/components/receive/receive-connect";
import { truncateAddress, type ReceiveFundingStats, type ReceiveLinkConfig } from "@/lib/receive-link";
import type { PublicReceiveProfile } from "@/lib/receive-resolve";

export type ReceivePageProps = {
  identifier: string;
  status: "ok" | "disabled" | "invalid" | "not_found";
  reason?: string;
  profile?: PublicReceiveProfile;
  config?: ReceiveLinkConfig;
  funding?: ReceiveFundingStats;
  payTo?: string;
  viewerAddress?: string | null;
  success?: "once" | "stream" | null;
};

export function ReceivePageView(props: ReceivePageProps) {
  if (props.status === "invalid" || props.status === "not_found") {
    return (
      <ReceiveShell payTo={null} viewerAddress={props.viewerAddress}>
        <StatusPanel
          title={props.status === "invalid" ? "Invalid receive link" : "Recipient not found"}
          body={props.reason || "This receive link could not be opened."}
        />
      </ReceiveShell>
    );
  }

  if (!props.profile || !props.config || !props.payTo) {
    return (
      <ReceiveShell payTo={null} viewerAddress={props.viewerAddress}>
        <StatusPanel title="Unavailable" body="This receive link could not be loaded." />
      </ReceiveShell>
    );
  }

  if (props.status === "disabled") {
    return (
      <ReceiveShell payTo={props.profile.address} viewerAddress={props.viewerAddress}>
        <DisabledPanel profile={props.profile} reason={props.reason} />
      </ReceiveShell>
    );
  }

  return (
    <ReceiveShell payTo={props.payTo} viewerAddress={props.viewerAddress}>
      <div className="mx-auto grid max-w-[980px] gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-start lg:gap-8">
        <RecipientColumn profile={props.profile} config={props.config} funding={props.funding} />
        <ReceiveCheckout
          identifier={props.identifier}
          profile={props.profile}
          config={props.config}
          payTo={props.payTo}
          viewerAddress={props.viewerAddress}
          initialSuccess={props.success}
        />
      </div>
    </ReceiveShell>
  );
}

function ReceiveShell({
  children,
  payTo,
  viewerAddress,
}: {
  children: React.ReactNode;
  payTo: string | null;
  viewerAddress?: string | null;
}) {
  return (
    <main className="min-h-dvh bg-[#F7F6F3] text-[#141414]">
      <header className="mx-auto flex max-w-[980px] items-center justify-between gap-3 px-4 pb-2 pt-4 sm:px-5 sm:pt-5">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-[-0.03em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#141414]"
        >
          <IconMark className="size-8" />
          Rvess
          <span className="rounded-full bg-[#D6F34A] px-2 py-0.5 text-[11px] font-semibold tracking-normal">Beta</span>
        </Link>
        <div className="flex items-center gap-2">
          {payTo ? (
            <span className="hidden font-mono text-xs text-[#5C6572] sm:inline">{truncateAddress(payTo)}</span>
          ) : null}
          <ReceiveConnectButton address={viewerAddress} />
        </div>
      </header>
      <div className="px-4 pb-10 pt-4 sm:px-5 sm:pt-6">{children}</div>
    </main>
  );
}

function RecipientColumn({
  profile,
  config,
  funding,
}: {
  profile: PublicReceiveProfile;
  config: ReceiveLinkConfig;
  funding?: ReceiveFundingStats;
}) {
  const title = config.title || profile.title || "Support what we're building.";
  const description =
    config.description ||
    profile.description ||
    "Your contribution helps build accessible financial tools for communities.";
  const cover = config.coverUrl.trim();
  const supporters = funding?.supporters ?? 0;
  const received = funding?.receivedUsd ?? "0";
  const committed = funding?.committedUsd ?? "0";
  const hasActivity = supporters > 0 || Number(received) > 0 || Number(committed) > 0;
  const socials = [
    config.socials.website ? { label: "Website", href: absoluteUrl(config.socials.website) } : null,
    config.socials.twitter ? { label: "X", href: `https://x.com/${config.socials.twitter.replace(/^@/, "")}` } : null,
    config.socials.farcaster
      ? { label: "Farcaster", href: `https://warpcast.com/${config.socials.farcaster.replace(/^@/, "")}` }
      : null,
    config.socials.github ? { label: "GitHub", href: `https://github.com/${config.socials.github.replace(/^@/, "")}` } : null,
  ].filter(Boolean) as { label: string; href: string }[];

  return (
    <aside className="space-y-4 lg:sticky lg:top-5">
      <section className="overflow-hidden rounded-[1.6rem] border border-[#E6EADF] bg-white shadow-[0_1px_0_rgba(20,20,20,0.04)]">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-36 w-full object-cover sm:h-40" />
        ) : (
          <div
            className="h-28 w-full bg-[linear-gradient(135deg,#F3FBE0_0%,#FFFFFF_55%,#E7F4C4_100%)] sm:h-32"
            aria-hidden
          />
        )}
        <div className="relative px-5 pb-5 pt-0">
          <div className="-mt-8 inline-block rounded-full bg-white p-1 shadow-[0_1px_0_rgba(20,20,20,0.06)]">
            <ProfileAvatar seed={profile.address} className="size-16 ring-2 ring-white" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <h1 className="text-[1.45rem] font-semibold tracking-[-0.04em] text-[#141414]">{profile.name}</h1>
            {profile.verified ? <BadgeCheck className="size-5 text-[#141414]" aria-label="Verified" /> : null}
          </div>
          {profile.username ? <p className="mt-0.5 text-sm text-[#5C6572]">@{profile.username}</p> : null}
          {profile.username || profile.name !== truncateAddress(profile.address) ? (
            <p className="mt-0.5 font-mono text-[13px] text-[#5C6572]">{truncateAddress(profile.address)}</p>
          ) : null}
          <p className="mt-3 text-[0.98rem] font-medium leading-snug tracking-[-0.02em] text-[#141414]">{title}</p>
          <p className="mt-2 text-sm leading-relaxed text-[#5C6572]">{description}</p>

          {hasActivity ? (
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Stat label="Supporters" value={String(supporters)} />
              <Stat label="Received" value={`$${received}`} />
              <Stat label="Streaming" value={`$${committed}`} />
            </div>
          ) : (
            <p className="mt-4 rounded-2xl bg-[#F3F7E8] px-3 py-2.5 text-sm text-[#5C6572]">No contributions yet. Be the first.</p>
          )}

          {config.fundingGoal && Number(config.fundingGoal) > 0 ? (
            <GoalBar received={Number(received)} goal={Number(config.fundingGoal)} />
          ) : null}

          {socials.length ? (
            <ul className="mt-4 flex flex-wrap gap-2">
              {socials.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-full border border-[#E6EADF] bg-[#F7F6F3] px-3 py-1.5 text-xs font-medium text-[#141414]"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#F7F6F3] px-2.5 py-2.5">
      <p className="text-sm font-semibold tabular-nums tracking-[-0.02em] text-[#141414]">{value}</p>
      <p className="mt-0.5 text-[11px] text-[#5C6572]">{label}</p>
    </div>
  );
}

function GoalBar({ received, goal }: { received: number; goal: number }) {
  const progress = Math.min(100, Math.round((received / goal) * 100));
  return (
    <div className="mt-4">
      <div className="h-1.5 overflow-hidden rounded-full bg-[#E6EADF]">
        <div className="h-full rounded-full bg-[#D6F34A]" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-2 text-xs text-[#5C6572]">
        ${received} of ${goal} received · stream commitments counted separately
      </p>
    </div>
  );
}

function StatusPanel({ title, body }: { title: string; body: string }) {
  return (
    <section className="mx-auto mt-8 max-w-md rounded-[1.6rem] border border-[#E6EADF] bg-white p-6 text-center shadow-[0_1px_0_rgba(20,20,20,0.04)]">
      <h1 className="text-xl font-semibold tracking-[-0.04em]">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-[#5C6572]">{body}</p>
      <Link
        href="/"
        className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-[#D6F34A] px-5 text-sm font-semibold text-[#141414]"
      >
        Go to Rvess
      </Link>
    </section>
  );
}

function DisabledPanel({ profile, reason }: { profile: PublicReceiveProfile; reason?: string }) {
  return (
    <section className="mx-auto mt-6 max-w-md rounded-[1.6rem] border border-[#E6EADF] bg-white p-6 shadow-[0_1px_0_rgba(20,20,20,0.04)]">
      <div className="flex items-center gap-3">
        <ProfileAvatar seed={profile.address} className="size-12" />
        <div>
          <h1 className="text-lg font-semibold tracking-[-0.03em]">{profile.name}</h1>
          {profile.username ? <p className="text-sm text-[#5C6572]">@{profile.username}</p> : null}
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-[#5C6572]">
        {reason || "This receive link is no longer accepting contributions."}
      </p>
    </section>
  );
}

function absoluteUrl(value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}
