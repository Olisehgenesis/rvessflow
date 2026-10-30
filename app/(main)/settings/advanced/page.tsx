import { Suspense } from "react";
import Link from "next/link";
import { AccountSwitch } from "@/components/forms";
import { SettingsSection } from "@/components/settings-ui";
import { ChainMark } from "@/components/token-icon";
import { TopBar } from "@/components/top-bar";
import { Fact, Notice } from "@/components/ui-bits";
import { labeled, money, shortAddress } from "@/lib/display";
import { networkName, stableLabel } from "@/lib/protocol";
import { loadSettings } from "@/lib/settings-view";
import Loading from "../../loading";

export default function AdvancedPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AdvancedBody />
    </Suspense>
  );
}

async function AdvancedBody() {
  const { who, data, quote, upgrade, links } = await loadSettings();
  return (
    <>
      <TopBar title="Advanced" back="/settings" desk={false} />
      <div className="space-y-4">
        {who.method === "tester" ? (
          <SettingsSection title="Switch account">
            <AccountSwitch people={data.people} current={data.me.address} />
          </SettingsSection>
        ) : null}
        <SettingsSection title="Protocol">
          <p className="mb-1 text-sm leading-relaxed text-[#5C6572]">
            {data.protocol.paused ? "New positions are paused." : "Open."} Pause, penalty, yield, and upgrades belong to the protocol admin.
          </p>
          <dl className="divide-y divide-[#E6EADF] text-sm">
            <Fact label="Account" value="Base and Celo" />
            <Fact label="Savings network" value={networkName} />
            <Fact label="Vault" value={data.vault ? shortAddress(data.vault) : "Not created yet"} />
            <Fact label="Savings on chain" value={`${money(data.total)} USD`} />
            <Fact label="USD token" value={data.protocol.tokenAllowed ? `Allowlisted (${stableLabel})` : "Not allowlisted"} />
            <Fact label="Lock penalty" value={`${(data.protocol.penaltyBps / 100).toFixed(2).replace(/\.00$/, "")}%`} />
            <Fact label="Yield budget" value={labeled(data.protocol.yieldBudget, quote)} />
            <Fact label="Upgrade" value={upgrade} />
            <Fact label="Admin" value={shortAddress(data.protocol.admin)} />
          </dl>
        </SettingsSection>
        <SettingsSection title="Contracts">
          <ul className="divide-y divide-[#E6EADF] text-sm">
            {links.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="flex min-h-12 items-center gap-2 font-medium">
                  {"chain" in link && link.chain ? <ChainMark chain={link.chain} className="size-5" /> : null}
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <Link href="/terms" className="flex min-h-12 items-center font-medium">
                Terms
              </Link>
            </li>
          </ul>
          <div className="pt-3">
            <Notice>These contracts are unaudited. An upgrade waits six hours after it is scheduled.</Notice>
          </div>
        </SettingsSection>
      </div>
    </>
  );
}
