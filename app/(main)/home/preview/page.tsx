import { Suspense } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { Address } from "viem";
import Loading from "../../loading";
import { HomeScreen } from "@/components/home-screen";

const firstWallet = "0x9b6A52A88a1Ee029Bd14170fFb8fB15839Bd18cB" as Address;

export default function PreviewPage() {
  return (
    <Suspense fallback={<Loading />}>
      <PreviewBody />
    </Suspense>
  );
}

async function PreviewBody() {
  await cookies();
  if (process.env.RVESS_HOME_FIXTURE !== "1") notFound();
  return (
    <HomeScreen
      who={{ address: firstWallet, name: "First wallet", index: -1 }}
      notice="Dev fixture. These are live Base balances of the documented first wallet (0x9b6A…18cB), not the signed-in account. The bundled test account has no balance."
    />
  );
}
