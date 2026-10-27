"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui-bits";
import { revealAccountKey } from "@/lib/account-key";

export function ExportKey({ method }: { method: "tester" | "passkey" | "wallet" }) {
  const [open, setOpen] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  function close() {
    setSecret("");
    setCopied(false);
    setError("");
    setUnderstood(false);
    setOpen(false);
  }

  function acknowledge(next: boolean) {
    setUnderstood(next);
    if (!next) {
      setSecret("");
      setCopied(false);
    }
  }

  async function show() {
    if (!understood) return;
    setPending(true);
    setError("");
    setCopied(false);
    const result = await revealAccountKey();
    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setSecret(result.key);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setError("Select the key and copy it. This browser blocked the clipboard.");
    }
  }

  if (method === "passkey") {
    return (
      <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm">
        <p className="font-medium">No key to export</p>
        <p className="mt-1 leading-relaxed text-muted-foreground">This passkey stays on this device. There is no private key to copy. The money stays at this address until this passkey signs a payment.</p>
      </div>
    );
  }

  if (method === "wallet") {
    return (
      <div className="flex items-start justify-between gap-4 border-y border-border py-3 text-sm">
        <p className="text-muted-foreground">Private key</p>
        <p className="max-w-[16rem] text-right font-medium">Held in the wallet you connected</p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        <span className="block text-sm font-medium">Export private key</span>
        <span className="mt-1 block text-sm text-muted-foreground">Anyone with it can move the money in this account.</span>
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-4">
      <p className="text-sm font-medium">Export private key</p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">This machine holds the key. Copy it somewhere private, then hide it. Do not send it in a chat or a screenshot.</p>
      <label className="mt-4 flex min-h-11 items-start gap-3 text-sm leading-snug">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-foreground"
          checked={understood}
          onChange={(event) => acknowledge(event.target.checked)}
        />
        I understand anyone with this key can move the money.
      </label>
      {secret ? <p className="mt-4 break-all rounded-2xl bg-muted px-4 py-3 font-mono text-sm leading-relaxed select-all">{secret}</p> : null}
      <div className="mt-3">
        <ErrorNote error={error} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {secret ? (
          <Button type="button" onClick={() => void copy()} className="h-12 rounded-full text-base">
            {copied ? "Copied" : "Copy"}
          </Button>
        ) : (
          <Button type="button" disabled={!understood || pending} onClick={() => void show()} className="h-12 rounded-full text-base">
            {pending ? "Reading…" : "Show the key"}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={close} className="h-12 rounded-full text-base">
          Hide
        </Button>
      </div>
    </div>
  );
}
