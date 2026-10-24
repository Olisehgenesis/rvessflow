import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LandingHome } from "@/components/landing-home";
import { loadQuote } from "@/lib/rates";
import type { Quote } from "@/lib/quote";
import { hasEntered, placeIsKnown } from "@/lib/session";

const shellQuote: Quote = { code: "usd", unit: "USD", perToken: 1, digits: 2, note: "" };

async function RedirectIfReady() {
  if (await hasEntered()) redirect("/home");
  return null;
}

async function PricedLanding() {
  const [quote, placed] = await Promise.all([loadQuote(), placeIsKnown()]);
  return <LandingHome quote={quote} placed={placed} />;
}

export default function SplashPage() {
  return (
    <>
      <Suspense fallback={null}>
        <RedirectIfReady />
      </Suspense>
      <Suspense fallback={<LandingHome quote={shellQuote} placed hold />}>
        <PricedLanding />
      </Suspense>
    </>
  );
}
