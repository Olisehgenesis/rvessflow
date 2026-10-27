import { Suspense } from "react";
import Link from "next/link";
import Loading from "../../loading";
import { ProductMark } from "@/components/product";
import { Page } from "@/components/ui-bits";

const paths = [
  {
    href: "/goals/expense/now",
    title: "Instant",
    body: "Pay someone from the wallet right now.",
  },
  {
    href: "/goals/expense/stream",
    title: "Streaming payments",
    body: "Send a little every second until the end date.",
  },
];

export default function ExpensePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Page title="Expense" back="/goals">
        <ul className="space-y-3">
          {paths.map((path) => (
            <li key={path.href}>
              <Link href={path.href} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
                <ProductMark kind="expense" size="md" />
                <span className="min-w-0">
                  <span className="block font-medium">{path.title}</span>
                  <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{path.body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Page>
    </Suspense>
  );
}
