import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LandingHome } from "@/components/landing-home";
import { hasEntered } from "@/lib/session";

async function RedirectIfReady() {
  if (await hasEntered()) redirect("/home");
  return null;
}

export default function SplashPage() {
  return (
    <>
      <Suspense fallback={null}>
        <RedirectIfReady />
      </Suspense>
      <LandingHome />
    </>
  );
}
