import { Suspense } from "react";
import Link from "next/link";
import Loading from "../loading";
import { LockLink } from "@/components/product";
import { Page } from "@/components/ui-bits";
import { loadQuote } from "@/lib/rates";
import { loadPortfolio } from "@/lib/protocol";
import { viewer } from "@/lib/session";

export default function VaultsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <VaultsBody />
    </Suspense>
  );
}

async function VaultsBody() {
  const who = await viewer();
  const [data, quote] = await Promise.all([loadPortfolio(who), loadQuote()]);
  return (
    <Page title="Locks" back="/home" bleed>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Lock your assets and earn more, with a small penalty for early access.
      </p>
      {data.locks.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-6 lg:flex lg:items-center lg:gap-5 lg:rounded-3xl lg:px-6">
          <img src="/marks/lock.png" alt="" className="hidden size-20 shrink-0 object-contain lg:block" />
          <div>
          <p className="font-medium">No locks yet</p>
          <p className="mt-1 text-sm text-muted-foreground">A lock keeps the principal in the lock contract until the unlock date.</p>
          </div>
        </div>
      ) : (
        <ul className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
          {data.locks.map((lock) => (
            <li key={lock.id}>
              <LockLink lock={lock} quote={quote} />
            </li>
          ))}
        </ul>
      )}
      <Link href="/vaults/new" className="mt-5 flex h-12 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground lg:w-fit lg:px-6">
        Create lock
      </Link>
    </Page>
  );
}
