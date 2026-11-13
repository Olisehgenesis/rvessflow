"use client";

import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { ProfileAvatar } from "@/components/profile-avatar";
import { IconMark } from "@/components/icons";
import { ReceiveCheckout } from "@/components/receive/receive-checkout";
import { ReceiveSuccess } from "@/components/receive/receive-success";
import { ReceiveConnectButton } from "@/components/receive/receive-connect";
import {
  truncateAddress,
  type ReceiveFundingStats,
  type ReceiveLinkConfig,
} from "@/lib/receive-link";
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
      <ReceiveShell viewerAddress={props.viewerAddress}>
        <UnavailableCard
          title={props.status === "invalid" ? "Invalid receive link" : "Recipient not found"}
          body={props.reason || "This receive link could not be opened."}
        />
      </ReceiveShell>
    );
  }

  if (!props.profile || !props.config || !props.payTo) {
    return (
      <ReceiveShell viewerAddress={props.viewerAddress}>
        <UnavailableCard title="Unavailable" body="This receive link could not be loaded." />
      </ReceiveShell>
    );
  }

  if (props.status === "disabled") {
    return (
      <ReceiveShell viewerAddress={props.viewerAddress}>
        <DisabledCard profile={props.profile} reason={props.reason} />
      </ReceiveShell>
    );
  }

  if (props.success) {
    return (
      <ReceiveShell viewerAddress={props.viewerAddress}>
        <ReceiveSuccess kind={props.success} profile={props.profile} identifier={props.identifier} />
      </ReceiveShell>
    );
  }

  return (
    <ReceiveShell viewerAddress={props.viewerAddress}>
      <div className="receive-grid">
        <aside className="receive-aside">
          <RecipientHero profile={props.profile} config={props.config} />
          <FundingPanel funding={props.funding} goal={props.config.fundingGoal} />
          <AboutBlock profile={props.profile} config={props.config} />
        </aside>
        <section className="receive-checkout-col">
          <ReceiveCheckout
            identifier={props.identifier}
            profile={props.profile}
            config={props.config}
            payTo={props.payTo}
            viewerAddress={props.viewerAddress}
          />
        </section>
      </div>
    </ReceiveShell>
  );
}

function ReceiveShell({ children, viewerAddress }: { children: React.ReactNode; viewerAddress?: string | null }) {
  return (
    <main className="receive-root">
      <header className="receive-header">
        <Link href="/" className="receive-brand">
          <IconMark className="size-8" />
          <span>Rvess</span>
        </Link>
        <ReceiveConnectButton address={viewerAddress} />
      </header>
      <div className="receive-body">{children}</div>
      <style jsx global>{`
        .receive-root {
          --rx-orange: #f47b35;
          --rx-blue: #315cff;
          --rx-cream: #f5f2eb;
          --rx-dark: #202020;
          --rx-light: #b8c7ff;
          min-height: 100dvh;
          background:
            radial-gradient(1200px 500px at 10% -10%, color-mix(in srgb, var(--rx-light) 55%, transparent), transparent 60%),
            radial-gradient(900px 420px at 100% 0%, color-mix(in srgb, var(--rx-orange) 18%, transparent), transparent 55%),
            var(--rx-cream);
          color: var(--rx-dark);
        }
        .receive-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          max-width: 1100px;
          margin: 0 auto;
          padding: 1.1rem 1.25rem 0.5rem;
        }
        .receive-brand {
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          font-weight: 700;
          letter-spacing: -0.03em;
          font-size: 1.05rem;
          color: var(--rx-dark);
        }
        .receive-body {
          max-width: 1100px;
          margin: 0 auto;
          padding: 1rem 1.25rem 3rem;
        }
        .receive-grid {
          display: grid;
          gap: 1.5rem;
        }
        @media (min-width: 960px) {
          .receive-grid {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
            align-items: start;
            gap: 2rem;
            padding-top: 0.75rem;
          }
        }
        .receive-aside {
          display: grid;
          gap: 1rem;
        }
        .receive-card {
          border: 1px solid color-mix(in srgb, var(--rx-dark) 10%, transparent);
          background: color-mix(in srgb, white 88%, var(--rx-cream));
          border-radius: 1.5rem;
          padding: 1.25rem;
        }
        .receive-cover {
          width: 100%;
          aspect-ratio: 16 / 7;
          object-fit: cover;
          border-radius: 1.15rem;
          margin-bottom: 1rem;
          background: linear-gradient(135deg, var(--rx-light), color-mix(in srgb, var(--rx-orange) 35%, white));
        }
        .receive-name {
          font-size: 1.55rem;
          line-height: 1.1;
          font-weight: 700;
          letter-spacing: -0.04em;
        }
        .receive-meta {
          color: color-mix(in srgb, var(--rx-dark) 62%, transparent);
          font-size: 0.92rem;
        }
        .receive-stat-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.65rem;
        }
        .receive-stat {
          border-radius: 1rem;
          background: color-mix(in srgb, var(--rx-blue) 8%, white);
          padding: 0.75rem 0.7rem;
        }
        .receive-stat strong {
          display: block;
          font-size: 1.05rem;
          letter-spacing: -0.03em;
        }
        .receive-stat span {
          display: block;
          margin-top: 0.15rem;
          font-size: 0.72rem;
          color: color-mix(in srgb, var(--rx-dark) 58%, transparent);
        }
        .receive-progress {
          margin-top: 0.9rem;
          height: 0.55rem;
          border-radius: 999px;
          background: color-mix(in srgb, var(--rx-dark) 8%, white);
          overflow: hidden;
        }
        .receive-progress > i {
          display: block;
          height: 100%;
          background: linear-gradient(90deg, var(--rx-orange), var(--rx-blue));
        }
        .receive-checkout-col {
          position: sticky;
          top: 0.75rem;
        }
        @media (max-width: 959px) {
          .receive-checkout-col {
            position: static;
          }
          .receive-stat-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}

function RecipientHero({ profile, config }: { profile: PublicReceiveProfile; config: ReceiveLinkConfig }) {
  const cover = config.coverUrl || "/receive/cover.jpg";
  const title = config.title || profile.title || "Support what we're building.";
  return (
    <section className="receive-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cover} alt="" className="receive-cover" />
      <div className="flex items-start gap-3">
        <ProfileAvatar seed={profile.address} className="size-14 shrink-0" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h1 className="receive-name">{profile.name}</h1>
            {profile.verified ? <BadgeCheck className="size-5 text-[var(--rx-blue)]" aria-label="Verified" /> : null}
          </div>
          {profile.username ? <p className="receive-meta">@{profile.username}</p> : <p className="receive-meta font-mono">{truncateAddress(profile.address)}</p>}
          <p className="mt-2 text-[0.98rem] leading-snug text-[color-mix(in_srgb,var(--rx-dark)_78%,transparent)]">{title}</p>
        </div>
      </div>
    </section>
  );
}

function FundingPanel({ funding, goal }: { funding?: ReceiveFundingStats; goal: string }) {
  const received = Number(funding?.receivedUsd || "0");
  const committed = Number(funding?.committedUsd || "0");
  const supporters = funding?.supporters ?? 0;
  const goalN = Number(goal || "0");
  const progress = goalN > 0 ? Math.min(100, Math.round((received / goalN) * 100)) : 0;
  const empty = supporters === 0 && received === 0 && committed === 0;

  return (
    <section className="receive-card">
      <h2 className="mb-3 text-sm font-semibold tracking-[-0.02em]">Funding activity</h2>
      {empty ? (
        <p className="text-sm leading-relaxed text-[color-mix(in_srgb,var(--rx-dark)_58%,transparent)]">No contributions yet. Be the first to support.</p>
      ) : (
        <>
          <div className="receive-stat-grid">
            <div className="receive-stat">
              <strong>{supporters}</strong>
              <span>Supporters</span>
            </div>
            <div className="receive-stat">
              <strong>${received || 0}</strong>
              <span>Received</span>
            </div>
            <div className="receive-stat">
              <strong>${committed || 0}</strong>
              <span>Active streams</span>
            </div>
          </div>
          {goalN > 0 ? (
            <div>
              <div className="receive-progress" aria-hidden>
                <i style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 text-xs text-[color-mix(in_srgb,var(--rx-dark)_58%,transparent)]">
                ${received} of ${goalN} goal · stream commitments counted separately
              </p>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function AboutBlock({ profile, config }: { profile: PublicReceiveProfile; config: ReceiveLinkConfig }) {
  const description =
    config.description ||
    profile.description ||
    "Your contribution helps build accessible financial tools for communities.";
  const socials = [
    config.socials.website ? { label: "Website", href: absoluteUrl(config.socials.website) } : null,
    config.socials.twitter ? { label: "X", href: `https://x.com/${config.socials.twitter.replace(/^@/, "")}` } : null,
    config.socials.farcaster ? { label: "Farcaster", href: `https://warpcast.com/${config.socials.farcaster.replace(/^@/, "")}` } : null,
    config.socials.github ? { label: "GitHub", href: `https://github.com/${config.socials.github.replace(/^@/, "")}` } : null,
  ].filter(Boolean) as { label: string; href: string }[];

  return (
    <section className="receive-card">
      <h2 className="mb-2 text-sm font-semibold tracking-[-0.02em]">About</h2>
      <p className="text-sm leading-relaxed text-[color-mix(in_srgb,var(--rx-dark)_72%,transparent)]">{description}</p>
      {socials.length ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {socials.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-full border border-[color-mix(in_srgb,var(--rx-dark)_12%,transparent)] bg-white px-3 py-1.5 text-xs font-medium"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function UnavailableCard({ title, body }: { title: string; body: string }) {
  return (
    <section className="receive-card mx-auto mt-10 max-w-lg text-center">
      <h1 className="receive-name">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-[color-mix(in_srgb,var(--rx-dark)_65%,transparent)]">{body}</p>
      <Link href="/" className="mt-5 inline-flex rounded-full bg-[var(--rx-dark)] px-5 py-2.5 text-sm font-semibold text-[var(--rx-cream)]">
        Go to Rvess
      </Link>
    </section>
  );
}

function DisabledCard({ profile, reason }: { profile: PublicReceiveProfile; reason?: string }) {
  return (
    <section className="receive-card mx-auto mt-8 max-w-lg">
      <div className="flex items-center gap-3">
        <ProfileAvatar seed={profile.address} className="size-12" />
        <div>
          <h1 className="receive-name text-[1.35rem]">{profile.name}</h1>
          {profile.username ? <p className="receive-meta">@{profile.username}</p> : null}
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-[color-mix(in_srgb,var(--rx-dark)_70%,transparent)]">
        {reason || "This receive link is no longer accepting contributions."}
      </p>
      <p className="mt-2 text-sm text-[color-mix(in_srgb,var(--rx-dark)_55%,transparent)]">The recipient may still be reachable elsewhere on Rvess.</p>
    </section>
  );
}

function absoluteUrl(value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}
