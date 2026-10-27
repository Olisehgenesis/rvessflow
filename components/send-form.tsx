"use client";

import { useActionState, useState } from "react";
import { isAddress } from "viem";
import { RecipientField } from "@/components/recipient-field";
import { useWalletIdentity, WalletFace, walletLines } from "@/components/wallet-identity";
import { TokenIcon } from "@/components/token-icon";
import { useSignedAction } from "@/components/sign-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorNote } from "@/components/ui-bits";
import { lookupAccount, sendFunds, type LookupState } from "@/lib/actions";
import { shortAddress } from "@/lib/display";
import type { SendChoice } from "@/lib/send-math";

const field = "h-12 rounded-2xl border-border bg-white px-4 text-base shadow-none";

export function SendForm({ mode, choices }: { mode: "address" | "friend"; choices: SendChoice[] }) {
  const [asset, setAsset] = useState(choices[0]?.asset ?? "");
  const [amount, setAmount] = useState("");
  const [who, setWho] = useState("");
  const [to, setTo] = useState("");
  const [lookup, find, finding] = useActionState(lookupAccount, null as LookupState);
  const [state, send, pending] = useSignedAction(sendFunds);
  const picked = choices.find((choice) => choice.asset === asset) ?? choices[0];
  const match = lookup?.address && lookup.query === who.trim() ? lookup : null;

  if (choices.length === 0) {
    return <p className="text-sm leading-relaxed text-muted-foreground">This wallet has nothing it can send yet.</p>;
  }

  return (
    <div className="space-y-5">
      {mode === "friend" ? (
        <form action={find} className="space-y-3">
          <label className="block space-y-1.5">
            <Label htmlFor="who">Their account</Label>
            <Input
              id="who"
              name="who"
              value={who}
              onChange={(event) => setWho(event.target.value)}
              autoComplete="off"
              placeholder="Email, phone, or member code"
              className={field}
            />
          </label>
          <Button type="submit" variant="outline" disabled={finding || who.trim().length === 0} className="h-12 w-full rounded-full text-base">
            {finding ? "Looking…" : "Find account"}
          </Button>
          {lookup?.error && lookup.query === who.trim() ? <ErrorNote error={lookup.error} /> : null}
        </form>
      ) : null}

      <form action={send} className="space-y-4">
        {mode === "friend" ? <input type="hidden" name="who" value={match ? who.trim() : ""} /> : null}
        <input type="hidden" name="asset" value={picked?.asset ?? ""} />
        {mode === "address" ? (
          <RecipientField name="to" value={to} onValue={setTo} />
        ) : match?.address ? (
          <KnownWallet address={match.address} name={match.name || "Wallet"} />
        ) : (
          <p className="text-sm text-muted-foreground">Find their account before you send.</p>
        )}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Token</legend>
          {choices.map((choice) => {
            const on = choice.asset === picked?.asset;
            return (
              <button
                key={choice.asset}
                type="button"
                aria-pressed={on}
                onClick={() => setAsset(choice.asset)}
                className={`flex w-full items-center gap-3 rounded-2xl bg-card px-3 py-3 text-left ${on ? "border-2 border-foreground" : "border border-border"}`}
              >
                <TokenIcon symbol={choice.label} className="size-10" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{choice.label}</span>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {choice.balance} {choice.label}
                  </span>
                </span>
              </button>
            );
          })}
        </fieldset>

        <label className="block space-y-1.5">
          <span className="flex items-center justify-between">
            <Label htmlFor="amount">Amount</Label>
            <button
              type="button"
              className="text-xs font-semibold"
              onClick={() => setAmount(picked?.max ?? "")}
            >
              Use available
            </button>
          </span>
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            className={field}
          />
          {picked?.asset === "eth" ? (
            <span className="block text-xs leading-relaxed text-muted-foreground">A little ETH stays in the wallet for the network fee.</span>
          ) : null}
        </label>

        <ErrorNote error={state?.error} />
        <Button type="submit" disabled={pending || (mode === "address" && !isAddress(to)) || (mode === "friend" && !match)} className="h-12 w-full rounded-full text-base">
          {pending ? "Sending…" : "Send"}
        </Button>
      </form>
    </div>
  );
}

function KnownWallet({ address, name }: { address: string; name: string }) {
  const lookup = useWalletIdentity(address);
  const lines = walletLines(lookup.identity, name, address);
  return (
    <div className="flex items-center rounded-2xl border border-[#E7EFE0] bg-[#F7FBF3] px-3 py-3">
      <WalletFace address={address} title={lines.title} subtitle={lines.subtitle || shortAddress(address)} avatar={lines.avatar} />
    </div>
  );
}
