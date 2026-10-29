"use client";

import { createContext, useContext } from "react";
import Link from "next/link";
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
