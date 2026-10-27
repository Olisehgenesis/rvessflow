import { Suspense } from "react";
import Link from "next/link";
import Loading from "../loading";
import { ProductMark } from "@/components/product";
import { Page } from "@/components/ui-bits";

const cards = [
  {
    href: "/goals/savings",
    kind: "saving" as const,
    title: "Saving",
    body: "Lock money until a future date.",
  },
  {
    href: "/goals/flow",
    kind: "flow" as const,
    title: "Flow",
    body: "Receive money every second.",
  },
  {
    href: "/goals/expense",
    kind: "expense" as const,
    title: "Expense",
    body: "Pay now, or stream the payment.",
  },
];

export default function SavePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Page title="Save">
        <ul className="space-y-3">
          {cards.map((card) => (
            <li key={card.href}>
              <Link href={card.href} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
                <ProductMark kind={card.kind} size="md" />
                <span className="min-w-0">
                  <span className="block font-medium">{card.title}</span>
                  <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{card.body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Page>
    </Suspense>
  );
}
