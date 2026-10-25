import { Suspense } from "react";
import Link from "next/link";
import Loading from "../loading";
import { KindIntro, LockLink } from "@/components/product";
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
    <Page
      title="Locks"
      action={
        <Link href="/vaults/new" className="text-sm font-medium text-foreground">
          Create lock
        </Link>
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Principal stays in the lock contract until the date. Breaking early costs the penalty that was copied when the lock was created. The live default is {(data.protocol.penaltyBps / 100).toFixed(2).replace(/\.00$/, "")}%.
      </p>
      {data.locks.length === 0 ? (
        <div>
          <KindIntro kind="lock" />
          <Link href="/vaults/new" className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
            Lock USDCx
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {data.locks.map((lock) => (
            <li key={lock.id}>
              <LockLink lock={lock} quote={quote} />
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
