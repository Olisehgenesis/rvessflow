"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import Link from "next/link";
import posthog from "posthog-js";
import { ProfileAvatar } from "@/components/profile-avatar";
import { AvatarTick } from "@/components/verify-badge";

const AccountContext = createContext<{ name: string; address: string; verified: boolean } | null>(null);

export function AccountFrame({
  name,
  address,
  verified = false,
  children,
}: {
  name: string;
  address: string;
  verified?: boolean;
  children: React.ReactNode;
}) {
  const identifiedAddress = useRef<string | null>(null);

  useEffect(() => {
    try {
      if (identifiedAddress.current && identifiedAddress.current !== address) posthog.reset();
      posthog.identify(address, { name });
      identifiedAddress.current = address;
    } catch {
      // Identity must not block the signed-in shell.
    }
  }, [address, name]);

  return <AccountContext.Provider value={{ name, address, verified }}>{children}</AccountContext.Provider>;
}

export function AccountMark() {
  const who = useContext(AccountContext);
  if (!who) return null;
  return (
    <Link href="/settings" aria-label={`${who.name} account`} className="shrink-0 rounded-full ring-2 ring-[#D6F34A]">
      <AvatarTick verified={who.verified}>
        <ProfileAvatar seed={who.address} />
      </AvatarTick>
    </Link>
  );
}
