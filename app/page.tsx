import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginGate } from "@/components/login-gate";
import { ProductMark } from "@/components/product";
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
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-background px-6 pt-8 pb-10">
        <p className="text-sm font-medium">RvessFlow</p>
        <h1 className="mt-3 max-w-[14rem] text-[2.7rem] leading-[1.05] font-semibold">
          Your money, in motion.
        </h1>
        <p className="mt-3 max-w-sm text-muted-foreground">
          A hold stays still. A stream moves every second. A lock waits for its date. This build is on Base Sepolia.
        </p>

        <section className="mt-8 border-y border-border py-5" aria-label="How money behaves">
          <div className="flex items-center gap-3">
            <div className="flex w-16 shrink-0 flex-col items-center gap-1.5 text-center">
              <ProductMark kind="saving" size="lg" />
              <p className="text-xs font-medium">Holding</p>
            </div>
            <div className="relative h-4 min-w-0 flex-1" aria-hidden="true">
              <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
              <div className="land-travel absolute inset-y-0 right-1 left-0">
                <span className="absolute top-1/2 right-0 size-2.5 -translate-y-1/2 rounded-full bg-motion" />
              </div>
            </div>
            <div className="flex w-16 shrink-0 flex-col items-center gap-1.5 text-center">
              <ProductMark kind="flow" size="lg" />
              <p className="text-xs font-medium">Streaming</p>
            </div>
          </div>
          <div className="mt-4 flex justify-end" aria-hidden="true">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
              <div className="land-sweep h-full w-full rounded-full bg-motion" />
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">Only a stream keeps moving. A hold does not tick.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 py-2">
              <ProductMark kind="expense" size="sm" />
              <p className="text-xs leading-snug text-muted-foreground">An expense streams to someone else.</p>
            </div>
            <div className="flex items-center gap-2 py-2">
              <ProductMark kind="lock" size="sm" />
              <p className="text-xs leading-snug text-muted-foreground">A lock waits until the date.</p>
            </div>
          </div>
        </section>

        <LoginGate />
      </main>
    </>
  );
}
