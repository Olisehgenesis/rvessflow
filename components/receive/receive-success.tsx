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
  const sharePath = `/r/${encodeURIComponent(identifier)}`;

  return (
    <section className="mx-auto mt-4 max-w-md rounded-[1.6rem] border border-[#E6EADF] bg-white p-6 text-center shadow-[0_1px_0_rgba(20,20,20,0.04)]">
      <div className="mx-auto grid size-16 place-items-center rounded-full bg-[#E7F4C4]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={kind === "stream" ? "/marks/flow.png" : "/marks/receive.png"} alt="" className="size-10 object-contain" />
      </div>
      <div className="mt-4 flex justify-center">
        <ProfileAvatar seed={profile.address} className="size-12" />
      </div>
      <h1 className="mt-3 text-[1.35rem] font-semibold tracking-[-0.04em] text-[#141414]">
        {kind === "stream" ? `You're now supporting ${profile.name}.` : "Your contribution was sent successfully."}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[#5C6572]">
        {kind === "stream"
          ? "The stream is live once the wallet transactions confirm. You can manage it from Goals."
          : "The transfer is complete. Thank you for supporting."}
      </p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link
          href={sharePath}
          className="inline-flex h-11 items-center justify-center rounded-full bg-[#D6F34A] px-5 text-sm font-semibold text-[#141414]"
        >
          Back to recipient
        </Link>
        <button
          type="button"
          className="inline-flex h-11 items-center justify-center rounded-full border border-[#E6EADF] bg-white px-5 text-sm font-semibold text-[#141414]"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(`${window.location.origin}${sharePath}`);
            } catch {
              // Ignore.
            }
          }}
        >
          Share receive link
        </button>
      </div>
      {kind === "stream" ? (
        <Link href="/goals" className="mt-4 inline-block text-sm font-medium text-[#141414] underline-offset-4 hover:underline">
          View streams in Goals
        </Link>
      ) : null}
    </section>
  );
}
