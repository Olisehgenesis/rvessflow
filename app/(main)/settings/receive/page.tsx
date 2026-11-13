import { headers } from "next/headers";
import { Suspense } from "react";
import { ReceiveSettingsForm } from "@/components/receive-settings";
import { TopBar } from "@/components/top-bar";
import { contactOf } from "@/lib/circle";
import { loadReceiveLink } from "@/lib/receive-store";
import { viewer } from "@/lib/session";
import Loading from "../../loading";

export default function ReceiveSettingsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ReceiveSettingsBody />
    </Suspense>
  );
}

async function ReceiveSettingsBody() {
  const who = await viewer();
  const config = await loadReceiveLink(who.address);
  const contact = await contactOf(who.address).catch(() => null);
  const host = (await headers()).get("x-forwarded-host") || (await headers()).get("host") || "rvess.xyz";
  const proto = (await headers()).get("x-forwarded-proto") || "https";
  const origin = `${proto}://${host}`;

  return (
    <>
      <TopBar title="Receive link" back="/settings" desk={false} />
      <div className="hidden lg:mb-4 lg:block">
        <h1 className="text-2xl font-semibold tracking-[-0.04em]">Receive link</h1>
      </div>
      <ReceiveSettingsForm address={who.address} memberCode={contact?.memberCode ?? ""} config={config} origin={origin} />
    </>
  );
}
