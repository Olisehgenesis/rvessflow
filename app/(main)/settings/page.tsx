import { Suspense } from "react";
import Link from "next/link";
import { ProfileForm } from "@/components/circle";
import { InstallButton } from "@/components/install-app";
import { CurrencyPick } from "@/components/currency-pick";
import { AccountSwitch } from "@/components/forms";
import Loading from "../loading";
import { Fact, Facts, Page } from "@/components/ui-bits";
import { contactIfReady } from "@/lib/circle";
import { labeled, money, shortAddress } from "@/lib/display";
import { loadQuote } from "@/lib/rates";
import { signOut } from "@/lib/actions";
import { addresses, explorer, loadPortfolio } from "@/lib/protocol";
import { viewer } from "@/lib/session";

export default function SettingsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SettingsBody />
    </Suspense>
  );
}

async function SettingsBody() {
  const who = await viewer();
  const [data, quote, directory] = await Promise.all([loadPortfolio(who), loadQuote(), contactIfReady(who.address)]);
  const signedIn =
    who.method === "passkey"
      ? "Passkey. The signing key stays on this device. This browser keeps an encrypted copy of the public credential."
      : who.method === "wallet"
        ? "WalletConnect. This app does not keep that wallet's key."
        : "A funded test account on this machine. The key never leaves this computer.";
  const upgrade = data.protocol.upgradeReadyAt
    ? new Date(data.protocol.upgradeReadyAt * 1000).toLocaleString()
    : "No upgrade is scheduled";
  return (
    <Page title="Settings">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Currency</p>
          <p className="text-xs text-muted-foreground">USDCx stays on Base. Other countries use the USDC price and that country’s rate.</p>
        </div>
        <CurrencyPick code={quote.code} />
      </div>
      {quote.note ? <p className="mb-4 text-sm text-muted-foreground">{quote.note}</p> : null}
      <p className="mb-3 text-sm text-muted-foreground">Signed in as {data.me.name}. {signedIn}</p>
      {directory.down ? (
        <p className="mb-4 text-sm text-muted-foreground">The member directory is unavailable, so the profile cannot load.</p>
      ) : (
        <ProfileForm contact={directory.contact} demo={who.method === "tester"} />
      )}
      <form action={signOut} className="mb-3">
        <button type="submit" className="h-11 rounded-full border border-border bg-card px-5 text-sm font-medium">
          Sign out
        </button>
      </form>
      <p className="mb-3 text-sm">
        <Link href="/terms" className="font-medium underline">
          Terms
        </Link>
      </p>
      <div className="mb-6">
        <InstallButton />
      </div>
      <p className="mb-3 text-sm text-muted-foreground">These four accounts sign from this machine on Base. They need ETH for gas and USDCx before a transaction can send. Their keys never leave this computer.</p>
      <AccountSwitch people={data.people} current={data.me.address} />
      <div className="mt-6">
      <Facts>
        <Fact label="Network" value="Base" />
        <Fact label="Account" value={shortAddress(data.me.address)} />
        <Fact label="Gas" value={`${Number(data.eth).toFixed(4)} ETH`} />
        <Fact label="On chain" value={`${money(data.total)} USDCx`} />
        <Fact label="Vault" value={data.vault ? shortAddress(data.vault) : "Not created yet"} />
        <Fact label="USDCx" value={data.protocol.tokenAllowed ? "Allowlisted" : "Not allowlisted"} />
        <Fact label="New positions" value={data.protocol.paused ? "Paused" : "Open"} />
        <Fact label="Lock penalty" value={`${(data.protocol.penaltyBps / 100).toFixed(2).replace(/\.00$/, "")}%`} />
        <Fact label="Yield budget" value={labeled(data.protocol.yieldBudget, quote)} />
        <Fact label="Upgrade" value={upgrade} />
      </Facts>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Pause, penalty, yield, and upgrades belong to the protocol admin ({shortAddress(data.protocol.admin)}), not to {data.me.name}. This screen shows the live values and does not pretend you can change them.
      </p>
      <section className="mt-6 text-sm leading-relaxed text-muted-foreground">
        <h2 className="text-base font-semibold text-foreground">Before real money</h2>
        <p className="mt-2">These contracts are unaudited. An upgrade waits two days after the owners schedule it. An expense stream can be liquidated if nobody closes it during the one-hour cushion. Yield pays only from a funded budget, and that budget is empty until someone fills it.</p>
      </section>
      <ul className="mt-4 space-y-2 text-sm">
        <li>
          <a className="text-foreground" href={`${explorer}/address/${data.me.address}`}>
            This account on Basescan
          </a>
        </li>
        <li>
          <a className="text-foreground" href={`${explorer}/address/${addresses.factory}`}>
            Vault factory
          </a>
        </li>
        <li>
          <a className="text-foreground" href={`${explorer}/address/${addresses.locks}`}>
            Lock vault
          </a>
        </li>
        <li>
          <a className="text-foreground" href={`${explorer}/address/${addresses.groups}`}>
            Group rotation
          </a>
        </li>
      </ul>
    </Page>
  );
}

