import { Suspense } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { Address } from "viem";
import { BalanceError, BalanceSkeleton } from "@/components/balance-card";
import { Greeting } from "@/components/greeting";
import { HomeHeader, HomeScreen } from "@/components/home-screen";
import Loading from "../../loading";

const firstWallet = "0x9b6A52A88a1Ee029Bd14170fFb8fB15839Bd18cB" as Address;
const notice =
  "Dev fixture. Not the signed-in account. The live view reads the documented first wallet (0x9b6A…18cB). Loading and error frames do not invent a balance.";

export default function PreviewPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <PreviewBody searchParams={searchParams} />
    </Suspense>
  );
}

async function PreviewBody({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await cookies();
  if (process.env.RVESS_HOME_FIXTURE !== "1") notFound();
  const view = (await searchParams).view;
  if (view === "loading" || view === "error") {
    return (
      <main className="px-4 pt-4 pb-8">
        <p className="mb-4 rounded-2xl border border-border bg-card px-3 py-2 text-xs leading-relaxed text-muted-foreground">{notice}</p>
        <HomeHeader name="First wallet" />
        <Greeting name="First wallet" />
        {view === "loading" ? <BalanceSkeleton /> : <BalanceError message="Base did not respond." />}
      </main>
    );
  }
  return (
    <HomeScreen
      who={{ address: firstWallet, name: "First wallet", index: -1 }}
      notice={notice}
    />
  );
}
