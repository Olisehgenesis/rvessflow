import { Suspense } from "react";
import { SettingsSection } from "@/components/settings-ui";
import { TopBar } from "@/components/top-bar";
import { VerifyPanel } from "@/components/verify-panel";
import { loadSettings } from "@/lib/settings-view";
import Loading from "../../loading";

export default function VerifyPage() {
  return (
    <Suspense fallback={<Loading />}>
      <VerifyBody />
    </Suspense>
  );
}

async function VerifyBody() {
  const { who, identity } = await loadSettings();
  return (
    <>
      <TopBar title="Verification" back="/settings" desk={false} />
      <SettingsSection title="Verification">
        <p className="mb-4 text-sm leading-relaxed text-[#5C6572]">Face check with GoodDollar, daily G$, CELO from their faucet, and linking a wallet that already has the tick.</p>
        <VerifyPanel
          address={who.address}
          method={who.method}
          verified={identity.verified}
          linked={identity.linked}
          root={identity.root}
          claimable={identity.claimable.toString()}
          expiresAt={identity.expiresAt}
        />
      </SettingsSection>
    </>
  );
}
