"use client";

import Link from "next/link";
import { ProfileAvatar } from "@/components/profile-avatar";
import type { PublicReceiveProfile } from "@/lib/receive-resolve";

export function ReceiveSuccess({
  kind,
  profile,
  identifier,
}: {
  kind: "once" | "stream";
  profile: PublicReceiveProfile;
  identifier: string;
}) {
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/r/${encodeURIComponent(identifier)}` : `/r/${encodeURIComponent(identifier)}`;

  return (
    <section className="receive-card mx-auto mt-6 max-w-lg text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/receive/success.jpg" alt="" className="mx-auto size-24 rounded-full object-cover" />
      <div className="mt-4 flex justify-center">
        <ProfileAvatar seed={profile.address} className="size-12" />
      </div>
      <h1 className="receive-name mt-3 text-[1.45rem]">
        {kind === "stream" ? `You're now supporting ${profile.name}.` : "Your contribution was sent successfully."}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[color-mix(in_srgb,#202020_60%,transparent)]">
        {kind === "stream"
          ? "The stream is live once the wallet transactions confirm. You can manage it from Goals."
          : "The transfer is complete. Thank you for supporting."}
      </p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link
          href={`/r/${encodeURIComponent(identifier)}`}
          className="inline-flex h-11 items-center justify-center rounded-full bg-[#315CFF] px-5 text-sm font-semibold text-white"
        >
          Back to recipient
        </Link>
        <button
          type="button"
          className="inline-flex h-11 items-center justify-center rounded-full border border-[color-mix(in_srgb,#202020_14%,transparent)] bg-white px-5 text-sm font-semibold"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(shareUrl);
            } catch {
              // Ignore.
            }
          }}
        >
          Share receive link
        </button>
      </div>
      {kind === "stream" ? (
        <Link href="/goals" className="mt-4 inline-block text-sm font-medium text-[#315CFF]">
          View streams in Goals
        </Link>
      ) : null}
    </section>
  );
}
