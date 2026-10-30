import { Suspense } from "react";
import { CopyAddress } from "@/components/copy-address";
import { ExportKey } from "@/components/export-key";
import { InstallButton } from "@/components/install-app";
import { SettingsRow, SettingsSection } from "@/components/settings-ui";
import { SignOutForm } from "@/components/sign-out";
import { TopBar } from "@/components/top-bar";
import { shortAddress } from "@/lib/display";
import { loadSettings } from "@/lib/settings-view";
import Loading from "../../loading";

export default function SecurityPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SecurityBody />
    </Suspense>
  );
}

async function SecurityBody() {
  const { who, data, signLabel } = await loadSettings();
  const how =
    who.method === "wallet"
      ? "Each payment opens in the wallet you connected. This app does not hold that key."
      : who.method === "passkey"
        ? "This device signs with your passkey. There is no private key to export."
        : "This machine signs payments for this account.";
  return (
    <>
      <TopBar title="Wallet & Security" back="/settings" desk={false} />
      <div className="space-y-4">
        <SettingsSection title="Wallet & Security">
          <p className="mb-1 text-sm leading-relaxed text-[#5C6572]">{how}</p>
          <SettingsRow label="Sign-in" value={signLabel} />
          <SettingsRow label="Wallet address" value={shortAddress(data.me.address)} action={<CopyAddress address={data.me.address} compact />} />
        </SettingsSection>
        <SettingsSection title="Keys and backup">
          <ExportKey method={who.method} />
        </SettingsSection>
        <SettingsSection title="This device">
          <div className="divide-y divide-[#E6EADF] text-sm">
            <div className="-mx-1">
              <InstallButton row />
            </div>
            <div className="pt-3">
              <SignOutForm className="inline-flex h-11 min-h-11 items-center rounded-full border border-[#E7C4B8] bg-white px-4 text-sm font-medium text-[#9A3412] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]" />
            </div>
          </div>
        </SettingsSection>
      </div>
    </>
  );
}
