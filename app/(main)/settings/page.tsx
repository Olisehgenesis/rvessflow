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
      ? "Passkey. You sign on this device. Gas is paid by the smart account through the bundler in NEXT_PUBLIC_BUNDLER_URL."
      : who.method === "wallet"
        ? "WalletConnect. Each payment opens in that wallet for you to confirm. This app does not keep the key."
        : "A funded test account. This machine signs with the key in wallet/testers.json, and that key never leaves the computer.";
  const upgrade = data.protocol.upgradeReadyAt
    ? new Date(data.protocol.upgradeReadyAt * 1000).toLocaleString()
    : "No upgrade is scheduled";
  return (
    <Page title="Settings">
      <nav className="mb-4 grid grid-cols-2 gap-2" aria-label="Wallet">
        <Link href="/vaults" className="rounded-3xl border border-border/70 bg-card px-4 py-3 text-sm font-semibold shadow-[0_10px_28px_rgba(20,27,45,0.05)]">
          Vaults
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">Locks</span>
        </Link>
        <Link href="/home/assets" className="rounded-3xl border border-border/70 bg-card px-4 py-3 text-sm font-semibold shadow-[0_10px_28px_rgba(20,27,45,0.05)]">
          Assets
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">Balances on Base</span>
        </Link>
      </nav>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Currency</p>
          <p className="text-xs text-muted-foreground">Balances are shown in USD. On chain that USD is USDCx, a wrapper of USDC on Base. Other countries add that country’s rate.</p>
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
      {who.method === "tester" ? (
        <>
          <p className="mb-3 text-sm text-muted-foreground">These test accounts sign from this machine on Base mainnet. They need ETH for gas. Payments can start from USDC, USDT, or ETH.</p>
          <AccountSwitch people={data.people} current={data.me.address} />
        </>
      ) : (
        <p className="mb-3 text-sm text-muted-foreground">Payments from this account are signed here. A passkey needs a Base bundler URL. A connected wallet confirms each transaction itself. Test accounts stay available from the sign-in screen.</p>
      )}
      <div className="mt-6">
      <Facts>
        <Fact label="Network" value="Base" />
        <Fact label="Account" value={shortAddress(data.me.address)} />
        <Fact label="Gas" value={`${Number(data.eth).toFixed(4)} ETH`} />
        <Fact label="Savings on chain" value={`${money(data.total)} USD`} />
        <Fact label="Vault" value={data.vault ? shortAddress(data.vault) : "Not created yet"} />
        <Fact label="USD token" value={data.protocol.tokenAllowed ? "Allowlisted (USDCx)" : "Not allowlisted"} />
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

