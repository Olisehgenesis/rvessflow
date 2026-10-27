"use client";

import { useEffect, useState } from "react";
import { getAddress, isAddress } from "viem";
import { useWalletIdentity, WalletFace, walletLines } from "@/components/wallet-identity";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { looksLikeName } from "@/lib/base-name";
import { shortAddress } from "@/lib/display";
import type { Person } from "@/lib/protocol";

const field = "h-12 rounded-2xl border-border bg-white px-4 text-base shadow-none";

export function RecipientField({
  name,
  people = [],
  me,
  value,
  onValue,
}: {
  name: string;
  people?: Person[];
  me?: string;
  value: string;
  onValue: (address: string) => void;
}) {
  const [typed, setTyped] = useState("");
  const others = people.filter((person) => person.address.toLowerCase() !== me?.toLowerCase());
  const lookup = useWalletIdentity(typed);
  const typedAddress = isAddress(typed.trim()) ? getAddress(typed.trim()) : "";
  const resolved = lookup.identity?.address || typedAddress;
  const self = Boolean(me && resolved && resolved.toLowerCase() === me.toLowerCase());
  const address = self ? "" : resolved;
  useEffect(() => {
    if (address !== value) onValue(address);
  }, [address, value, onValue]);

  const known = others.find((person) => person.address.toLowerCase() === address.toLowerCase());
  const lines = walletLines(lookup.identity, known?.name, address || resolved);
  const note = noteFor(typed, lookup.pending, lookup.identity, self);

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={address} />
      {others.length > 0 ? (
        <div className="space-y-2">
          <Label>Send to</Label>
          {others.map((person) => (
            <PersonRow
              key={person.address}
              person={person}
              selected={person.address.toLowerCase() === address.toLowerCase()}
              onPick={() => {
                setTyped(person.address);
                onValue(person.address);
              }}
            />
          ))}
        </div>
      ) : null}
      <label className="block space-y-1.5">
        <Label htmlFor={`${name}-wallet`}>{others.length > 0 ? "Or another wallet" : "Wallet"}</Label>
        <Input
          id={`${name}-wallet`}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            onValue("");
          }}
          placeholder="0x… or name.base.eth"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          className={field}
          aria-invalid={Boolean(note.error)}
        />
      </label>
      {typed.trim() && (lookup.pending || lookup.identity || isAddress(typed.trim())) ? (
        <div className={`flex items-center rounded-2xl border px-3 py-3 ${self ? "border-destructive/40 bg-card" : "border-[#E7EFE0] bg-[#F7FBF3]"}`}>
          <WalletFace address={lines.address || typed} title={lines.title} subtitle={lines.subtitle} avatar={lines.avatar} />
        </div>
      ) : null}
      <p className={`text-sm ${note.error ? "text-destructive" : "text-muted-foreground"}`}>{note.text}</p>
    </div>
  );
}

function PersonRow({ person, selected, onPick }: { person: Person; selected: boolean; onPick: () => void }) {
  const lookup = useWalletIdentity(person.address);
  const lines = walletLines(lookup.identity, person.name, person.address);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onPick}
      className={`flex min-h-14 w-full items-center rounded-2xl px-3 py-2.5 text-left ${selected ? "border-2 border-foreground bg-card" : "border border-border bg-card"}`}
    >
      <WalletFace address={person.address} title={lines.title} subtitle={lines.subtitle || shortAddress(person.address)} avatar={lines.avatar} />
    </button>
  );
}

function noteFor(typed: string, pending: boolean, identity: { address: string } | null, self: boolean) {
  const value = typed.trim();
  if (!value) return { error: false, text: "Any wallet. Paste an address or a Base name." };
  if (pending) return { error: false, text: "Looking up this wallet…" };
  if (self) return { error: true, text: "That address is this account. A stream to you is a Flow." };
  if (identity) return { error: false, text: "This is who receives the stream." };
  if (looksLikeName(value)) return { error: true, text: "That name does not point at a wallet." };
  if (!isAddress(value)) return { error: true, text: "Enter a wallet address or a name like name.base.eth." };
  return { error: false, text: "No Base name on this wallet yet." };
}
