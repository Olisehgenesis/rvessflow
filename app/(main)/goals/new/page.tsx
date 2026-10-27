import { Suspense } from "react";
import { SavingForm, StreamForm } from "@/components/forms";
import { GoalName } from "@/components/goal-name";
import Loading from "../../loading";
import { KindIntro } from "@/components/product";
import { Page } from "@/components/ui-bits";
import { loadPayChoices } from "@/lib/holdings";
import { loadPortfolio } from "@/lib/protocol";
import { viewer } from "@/lib/session";

export default function NewGoalPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <NewGoalBody searchParams={searchParams} />
    </Suspense>
  );
}

async function NewGoalBody({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const who = await viewer();
  const [data, choices] = await Promise.all([loadPortfolio(who), loadPayChoices(who.address)]);
  const params = await searchParams;
  const kind = params.kind === "flow" || params.kind === "expense" ? params.kind : "saving";
  const title = kind === "flow" ? "Flow" : kind === "expense" ? "Streaming payment" : "Saving";
  const back = kind === "flow" ? "/goals/flow" : kind === "expense" ? "/goals/expense/stream" : "/goals/savings";
  const line = kind === "flow" ? "This pays you every second until the end date." : kind === "expense" ? "This pays someone else every second until the end date." : "This locks the money until the end date.";
  const placeholder = kind === "flow" ? "Name this flow" : kind === "expense" ? "Name this payment" : "Name this saving";
  return (
    <Page title={title} back={back}>
      <GoalName placeholder={placeholder}>
        <KindIntro kind={kind} rest={line} />
        {kind === "saving" ? (
          <SavingForm me={data.me.address} choices={choices} />
        ) : (
          <StreamForm kind={kind} people={data.people} me={data.me.address} choices={choices} />
        )}
      </GoalName>
    </Page>
  );
}
