import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AccountSettings, IdentityHero } from "@/components/settings-account";
import { SettingsHubList } from "@/components/settings-ui";
import { TopBar } from "@/components/top-bar";
import { loadSettings } from "@/lib/settings-view";
import Loading from "../loading";

export default function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<Loading />}>
      <SettingsHub searchParams={searchParams} />
    </Suspense>
  );
}

async function SettingsHub({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  if (query.from === "fv" || query.verified != null || query.isVerified != null) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === "string") params.set(key, value);
    }
    redirect(`/settings/verify?${params.toString()}`);
  }
  const view = await loadSettings();
  return (
    <>
      <div className="lg:hidden">
        <TopBar title="Settings" desk={false} />
        <div className="space-y-4">
          <IdentityHero view={view} compact />
          <SettingsHubList />
        </div>
      </div>
      <div className="hidden lg:block">
        <AccountSettings view={view} />
      </div>
    </>
  );
}
