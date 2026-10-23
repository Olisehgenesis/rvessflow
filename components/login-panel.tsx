"use client";

import { useEffect, useState } from "react";
import { enterApp } from "@/lib/actions";
import { connectWallet, createPasskeyWallet, unlockPasskey } from "@/lib/auth-client";
import { readPasskeys, type SavedPasskey } from "@/lib/passkey-vault";
import { shortAddress } from "@/lib/display";

function readable(error: unknown): string {
  const text = error instanceof Error ? error.message : "Something went wrong.";
  if (/reject|reset|closed|cancel|dismiss/i.test(text)) return "That was cancelled.";
  return text;
}

function redirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: unknown }).digest).includes("NEXT_REDIRECT")
  );
}

export function LoginPanel() {
  const [saved, setSaved] = useState<SavedPasskey[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    readPasskeys()
      .then(setSaved)
      .catch(() => setError("A passkey saved in this browser could not be opened. Create it again on this device."));
  }, []);

  async function run(label: string, task: () => Promise<void>) {
    setError("");
    setBusy(label);
    try {
      await task();
    } catch (caught) {
      if (redirectError(caught)) throw caught;
      setError(readable(caught));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mt-8 space-y-3">
      <label className="block text-sm font-medium" htmlFor="passkey-name">
        Name on this device
        <input
          id="passkey-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your name"
          autoComplete="nickname"
          className="mt-2 h-12 w-full rounded-2xl border border-border bg-card px-4 text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        />
      </label>

      {saved.map((passkey) => (
        <button
          key={passkey.address}
          type="button"
          disabled={busy !== ""}
          onClick={() => run("Waiting for your passkey…", () => unlockPasskey(passkey))}
          className="flex min-h-12 w-full flex-col items-center justify-center rounded-full bg-primary px-4 py-2 text-base font-medium text-primary-foreground transition-transform duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.97] disabled:opacity-60"
        >
          <span>{busy === "Waiting for your passkey…" ? busy : `Unlock ${passkey.label}`}</span>
          <span className="text-xs font-normal opacity-70">{shortAddress(passkey.address)}</span>
        </button>
      ))}

      <button
        type="button"
        disabled={busy !== ""}
        onClick={() => run("Creating your passkey…", () => createPasskeyWallet(name))}
        className={
          saved.length > 0
            ? "h-12 w-full text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:opacity-60"
            : "h-12 w-full rounded-full bg-primary text-base font-medium text-primary-foreground transition-transform duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.97] disabled:opacity-60"
        }
      >
        {busy === "Creating your passkey…" ? busy : saved.length > 0 ? "Create another passkey" : "Create a passkey wallet"}
      </button>

      <button
        type="button"
        disabled={busy !== ""}
        onClick={() => run("Opening WalletConnect…", () => connectWallet())}
        className="h-12 w-full rounded-full border border-border bg-card text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.97] disabled:opacity-60"
      >
        {busy === "Opening WalletConnect…" ? busy : "Connect a wallet"}
      </button>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <p className="text-sm leading-relaxed text-muted-foreground">
        A passkey creates a smart account on Base Sepolia. The signing key stays in your device. This browser stores only an encrypted copy of the public credential, so the same passkey can open the same account here. WalletConnect uses a wallet you already have. You pay your own gas.
      </p>

      <form action={enterApp}>
        <button
          type="submit"
          className="h-12 w-full text-sm font-medium text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          Use a funded test account
        </button>
      </form>
    </div>
  );
}
