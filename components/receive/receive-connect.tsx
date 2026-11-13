"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { noteTerms, openContributeSession } from "@/lib/actions";
import { requestWalletAccount } from "@/lib/auth-client";
import { truncateAddress } from "@/lib/receive-link";

export function ReceiveConnectButton({ address }: { address?: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (address) {
    return (
      <span className="inline-flex h-10 items-center rounded-full border border-[#E6EADF] bg-white px-3 font-mono text-xs font-medium text-[#141414]">
        {truncateAddress(address)}
      </span>
    );
  }

  async function connect() {
    setBusy(true);
    setError("");
    try {
      const next = await requestWalletAccount();
      await noteTerms();
      await openContributeSession(next, "wallet", "Wallet");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "The wallet could not connect.";
      if (/reject|denied|dismiss|cancel|reset/i.test(message)) {
        setError("Wallet connection was cancelled.");
      } else {
        setError(message.slice(0, 120));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-right">
      <button
        type="button"
        disabled={busy}
        onClick={() => void connect()}
        className="inline-flex h-10 items-center rounded-full border border-[#E6EADF] bg-white px-4 text-sm font-semibold text-[#141414] hover:bg-[#F7F6F3] disabled:opacity-60"
      >
        {busy ? "Connecting…" : "Connect wallet"}
      </button>
      {error ? <p className="mt-1 max-w-[14rem] text-left text-xs text-[#b42318] sm:text-right">{error}</p> : null}
    </div>
  );
}

export function useReceiveConnect() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function connect() {
    setBusy(true);
    setError("");
    try {
      const next = await requestWalletAccount();
      await noteTerms();
      await openContributeSession(next, "wallet", "Wallet");
      router.refresh();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "The wallet could not connect.";
      if (/reject|denied|dismiss|cancel|reset/i.test(message)) {
        setError("Wallet connection was cancelled.");
      } else {
        setError(message.slice(0, 120));
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { connect, busy, error, setError };
}
