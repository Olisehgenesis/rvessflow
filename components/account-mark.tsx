"use client";

import { createContext, useContext } from "react";
import Link from "next/link";
import { ProfileAvatar } from "@/components/profile-avatar";

const AccountContext = createContext<{ name: string; address: string } | null>(null);

export function AccountFrame({
  name,
  address,
  children,
}: {
  name: string;
  address: string;
  children: React.ReactNode;
}) {
  return <AccountContext.Provider value={{ name, address }}>{children}</AccountContext.Provider>;
}

export function AccountMark() {
  const who = useContext(AccountContext);
  if (!who) return null;
  return (
    <Link href="/settings" aria-label={`${who.name} account`} className="shrink-0 rounded-full ring-2 ring-[#D6F34A]">
      <ProfileAvatar seed={who.address} />
    </Link>
  );
}
