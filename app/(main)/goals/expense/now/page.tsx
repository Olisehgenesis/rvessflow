import { Suspense } from "react";
import Link from "next/link";
import Loading from "../../../loading";
import { Page } from "@/components/ui-bits";

const paths = [
  { href: "/home/send/friend", title: "To a person", body: "Find them by email, phone, or member code." },
  { href: "/home/send/address", title: "To an address", body: "Send a token this wallet holds on Base or Celo." },
];

export default function InstantExpensePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Page title="Instant" back="/goals/expense">
        <p className="mb-4 text-sm text-muted-foreground">This leaves the wallet now. Nothing is scheduled.</p>
        <ul className="space-y-3">
          {paths.map((path) => (
            <li key={path.href}>
              <Link href={path.href} className="block rounded-2xl border border-border bg-card px-4 py-4">
                <span className="block font-medium">{path.title}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{path.body}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Page>
    </Suspense>
  );
}
