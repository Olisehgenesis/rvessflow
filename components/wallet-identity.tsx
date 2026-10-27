"use client";

import { useEffect, useState } from "react";
import { getAddress, isAddress } from "viem";
import { ProfileAvatar } from "@/components/profile-avatar";
import { looksLikeName, lookupWallet, type WalletIdentity } from "@/lib/base-name";
import { shortAddress } from "@/lib/display";

export function useWalletIdentity(query: string) {
  const trimmed = query.trim();
  const [found, setFound] = useState<{ query: string; identity: WalletIdentity | null; pending: boolean }>({
    query: "",
    identity: null,
    pending: false,
  });

  useEffect(() => {
    if (!trimmed || (!isAddress(trimmed) && !looksLikeName(trimmed))) return;
    let cancel = false;
    const timer = window.setTimeout(() => {
      void lookupWallet(trimmed).then((identity) => {
        if (!cancel) setFound({ query: trimmed, identity, pending: false });
      });
    }, 280);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [trimmed]);

  if (!trimmed || (!isAddress(trimmed) && !looksLikeName(trimmed))) {
    return { identity: null, pending: false };
  }
  if (found.query !== trimmed) return { identity: null, pending: true };
  return { identity: found.identity, pending: found.pending };
}

export function WalletFace({
  address,
  title,
  subtitle,
  avatar,
}: {
  address: string;
  title: string;
  subtitle: string;
  avatar?: string | null;
}) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      {avatar ? (
        <img src={avatar} alt="" className="size-11 shrink-0 rounded-full object-cover" />
      ) : (
        <ProfileAvatar seed={address} className="size-11" />
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-[#141414]">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
    </span>
  );
}

export function walletLines(identity: WalletIdentity | null, fallbackName?: string, address?: string) {
  const shown = address || identity?.address || "";
  const title = identity?.label || fallbackName || identity?.basename || (shown ? shortAddress(shown) : "Wallet");
  const subtitle =
    identity?.basename && title !== identity.basename
      ? identity.basename
      : shown
        ? shortAddress(shown)
        : "";
  return { title, subtitle, avatar: identity?.avatar ?? null, address: identity?.address || (shown && isAddress(shown) ? getAddress(shown) : "") };
}
