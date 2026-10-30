import { after } from "next/server";
import { SettingsNav } from "@/components/settings-ui";
import { TopBar } from "@/components/top-bar";
import { topCeloFaucet } from "@/lib/good-faucet";
import { loadIdentity } from "@/lib/good-identity";
import { viewer } from "@/lib/session";

async function TopVerifiedIfLow() {
  const who = await viewer();
  const identity = await loadIdentity(who.address);
  if (identity.verified) after(() => topCeloFaucet(who.address));
  return null;
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="px-4 pb-8 lg:px-0">
      <TopVerifiedIfLow />
      <div className="lg:max-w-none">
        <div className="hidden lg:block">
          <TopBar title="Settings" />
        </div>
        <div className="lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)] lg:items-start lg:gap-8">
          <SettingsNav />
          <div className="min-w-0 lg:max-w-4xl">{children}</div>
        </div>
      </div>
    </main>
  );
}
