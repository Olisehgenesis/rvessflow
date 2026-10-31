import { Suspense } from "react";
import { ProfileForm } from "@/components/circle";
import { CurrencyPick } from "@/components/currency-pick";
import { SettingsRow, SettingsSection } from "@/components/settings-ui";
import { TopBar } from "@/components/top-bar";
import { restartOnboarding } from "@/lib/actions";
import { loadSettings } from "@/lib/settings-view";
import Loading from "../../loading";

export default function PreferencesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <PreferencesBody />
    </Suspense>
  );
}

async function PreferencesBody() {
  const { who, quote, directory, contactHint } = await loadSettings();
  return (
    <>
      <TopBar title="Preferences" back="/settings" desk={false} />
      <div className="space-y-4">
        <SettingsSection title="Preferences">
          <p className="mb-1 text-sm leading-relaxed text-[#5C6572]">How amounts appear, and how people find this account.</p>
          <SettingsRow
            label="Currency"
            value={<CurrencyPick code={quote.code} className="h-10 max-w-[13.5rem] rounded-full border border-[#E6EADF] bg-[#F7F8F4] px-3 text-sm text-[#141414]" />}
          />
          <SettingsRow label="How people find you" value={<span className="truncate">{contactHint}</span>} />
          {quote.note ? <p className="pt-3 text-sm text-[#5C6572]">{quote.note}</p> : null}
        </SettingsSection>
        <SettingsSection title="Tour">
          <p className="mb-3 text-sm leading-relaxed text-[#5C6572]">Replay the first-run walkthrough of Home, Save, Groups, and Account.</p>
          <form action={restartOnboarding}>
            <button type="submit" className="inline-flex h-11 items-center rounded-full bg-[#141414] px-4 text-sm font-semibold text-white">
              Replay the tour
            </button>
          </form>
        </SettingsSection>
        <SettingsSection title="Discovery">
          {directory.down ? (
            <p className="text-sm text-[#5C6572]">The member directory is unavailable, so the profile cannot load.</p>
          ) : (
            <ProfileForm contact={directory.contact} demo={who.method === "tester"} />
          )}
        </SettingsSection>
      </div>
    </>
  );
}
