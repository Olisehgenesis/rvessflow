import { Suspense } from "react";
import Link from "next/link";
import Loading from "../loading";
import { GoalLink, KindChoices } from "@/components/product";
import { Page } from "@/components/ui-bits";
import { loadQuote } from "@/lib/rates";
import { loadPortfolio } from "@/lib/protocol";
import { viewer } from "@/lib/session";

export default function GoalsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <GoalsBody />
    </Suspense>
  );
}

async function GoalsBody() {
  const who = await viewer();
  const [data, quote] = await Promise.all([loadPortfolio(who), loadQuote()]);
  return (
    <Page
      title="Goals"
      action={
        <Link href="/goals/new" className="text-sm font-medium text-foreground">
          Create goal
        </Link>
      }
    >
      {data.flows.length === 0 ? (
        <KindChoices lead="No goals yet. Pick a kind." />
      ) : (
        <ul className="divide-y divide-border">
          {data.flows.map((flow) => (
            <li key={flow.id}>
              <GoalLink flow={flow} readAt={data.readAt} quote={quote} />
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
