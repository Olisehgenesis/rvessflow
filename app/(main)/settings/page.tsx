import { Suspense } from "react";
import Link from "next/link";
import { ProfileForm } from "@/components/circle";
import { ProfileAvatar } from "@/components/profile-avatar";
import { CopyAddress } from "@/components/copy-address";
import { ExportKey } from "@/components/export-key";
import { InstallButton } from "@/components/install-app";
import { CurrencyPick } from "@/components/currency-pick";
import { AccountSwitch } from "@/components/forms";
import Loading from "../loading";
import { Fact, Notice, Page } from "@/components/ui-bits";
import { contactIfReady, type Contact } from "@/lib/circle";
import { labeled, money, shortAddress } from "@/lib/display";
import { loadQuote } from "@/lib/rates";
import { signOut } from "@/lib/actions";
import { addresses, explorer, loadPortfolio, networkName, stableLabel } from "@/lib/protocol";
import { viewer } from "@/lib/session";

export default function SettingsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SettingsBody />
    </Suspense>
  );
}

function findLine(contact: Contact) {
  if (contact.memberCode) return contact.memberCode;
  if (contact.phones[0]) return contact.phones[0];
  if (contact.email) return contact.email;
  return "Not set";
}

async function SettingsBody() {
  const who = await viewer();
  const [data, quote, directory] = await Promise.all([loadPortfolio(who), loadQuote(), contactIfReady(who.address)]);
  const signLabel = who.method === "passkey" ? "Passkey on this device" : who.method === "wallet" ? "Connected wallet" : "Signs on this machine";
  const upgrade = data.protocol.upgradeReadyAt ? new Date(data.protocol.upgradeReadyAt * 1000).toLocaleString() : "Not scheduled";
  const links = [
    { href: `${explorer}/address/${data.me.address}`, label: "This account on Basescan" },
    { href: `${explorer}/address/${addresses.factory}`, label: "Vault factory" },
    { href: `${explorer}/address/${addresses.locks}`, label: "Lock vault" },
    { href: `${explorer}/address/${addresses.groups}`, label: "Group rotation" },
  ];
  return (
    <Page title="Account">
      <div className="flex items-center gap-3">
        <ProfileAvatar seed={who.address} className="size-14 ring-2 ring-[#D6F34A]" />
        <div className="min-w-0">
          <p className="text-base font-semibold">{data.me.name}</p>
          <p className="text-sm text-muted-foreground">{shortAddress(data.me.address)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-[#E7F4C4] px-2.5 py-1 text-xs font-medium">{signLabel}</span>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{networkName}</span>
          </div>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{Number(data.eth).toFixed(4)} ETH for network fees</p>
      <CopyAddress address={data.me.address} />

      <div className="mt-6 flex items-center justify-between gap-3 border-y border-border py-3">
        <p className="text-sm font-medium">Currency</p>
        <CurrencyPick code={quote.code} />
      </div>
      {quote.note ? <p className="py-3 text-sm text-muted-foreground">{quote.note}</p> : null}

      {directory.down ? (
        <p className="border-y border-border py-3 text-sm text-muted-foreground">The member directory is unavailable, so the profile cannot load.</p>
      ) : (
        <details className="border-y border-border">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">
              <span className="block font-medium">How people find you</span>
              <span className="block truncate text-muted-foreground">{findLine(directory.contact)}</span>
            </span>
            <span className="shrink-0 font-medium">Edit</span>
          </summary>
          <ProfileForm contact={directory.contact} demo={who.method === "tester"} />
        </details>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Security</h2>
        <p className="mt-1 mb-3 text-sm leading-relaxed text-muted-foreground">
          {who.method === "wallet"
            ? "Each payment opens in the wallet you connected. This app does not hold that key."
            : who.method === "passkey"
              ? "This device signs with your passkey."
              : "This machine signs payments for this account. Switching accounts below keeps you signed in."}
        </p>
        <ExportKey held={who.method === "tester"} />
        <ul className="mt-3 divide-y divide-border border-y border-border text-sm">
          <li>
            <InstallButton row />
          </li>
          <li>
            <form action={signOut}>
              <button type="submit" className="min-h-12 w-full py-3 text-left font-medium">
                Sign out
              </button>
            </form>
          </li>
        </ul>
      </section>

      {who.method === "tester" ? (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold">Switch account</h2>
          <AccountSwitch people={data.people} current={data.me.address} />
        </section>
      ) : null}

      <details className="mt-8 border-y border-border">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block font-medium">Protocol</span>
            <span className="block text-muted-foreground">{data.protocol.paused ? "New positions are paused" : "Open"} · view only</span>
          </span>
          <span className="shrink-0 font-medium">View</span>
        </summary>
        <dl className="divide-y divide-border border-b border-border text-sm">
          <Fact label="Network" value={networkName} />
          <Fact label="Vault" value={data.vault ? shortAddress(data.vault) : "Not created yet"} />
          <Fact label="Savings on chain" value={`${money(data.total)} USD`} />
          <Fact label="USD token" value={data.protocol.tokenAllowed ? `Allowlisted (${stableLabel})` : "Not allowlisted"} />
          <Fact label="Lock penalty" value={`${(data.protocol.penaltyBps / 100).toFixed(2).replace(/\.00$/, "")}%`} />
          <Fact label="Yield budget" value={labeled(data.protocol.yieldBudget, quote)} />
          <Fact label="Upgrade" value={upgrade} />
          <Fact label="Admin" value={shortAddress(data.protocol.admin)} />
        </dl>
        <p className="py-3 text-sm leading-relaxed text-muted-foreground">Pause, penalty, yield, and upgrades belong to the protocol admin. This account cannot change them.</p>
        <ul className="divide-y divide-border border-t border-border text-sm">
          {links.map((link) => (
            <li key={link.href}>
              <a href={link.href} className="block py-3 font-medium">
                {link.label}
              </a>
            </li>
          ))}
          <li>
            <Link href="/terms" className="block py-3 font-medium">
              Terms
            </Link>
          </li>
        </ul>
        <div className="py-3">
          <Notice>These contracts are unaudited. An upgrade waits two days after it is scheduled.</Notice>
        </div>
      </details>
    </Page>
  );
}
