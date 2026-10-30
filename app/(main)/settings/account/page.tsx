import { Suspense } from "react";
import { AccountSettings } from "@/components/settings-account";
import { TopBar } from "@/components/top-bar";
import { loadSettings } from "@/lib/settings-view";
import Loading from "../../loading";

export default function AccountPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AccountBody />
    </Suspense>
  );
}

async function AccountBody() {
  const view = await loadSettings();
  return (
    <>
      <TopBar title="Account" back="/settings" desk={false} />
      <AccountSettings view={view} />
    </>
  );
}
