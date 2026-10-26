import { Suspense } from "react";
import { SavingForm, StreamForm } from "@/components/forms";
import { GoalName } from "@/components/goal-name";
import Loading from "../../loading";
import { KindIntro } from "@/components/product";
import { Page } from "@/components/ui-bits";
import { loadPayChoices } from "@/lib/holdings";
import { loadPortfolio } from "@/lib/protocol";
import { viewer } from "@/lib/session";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const initial = params.kind === "flow" || params.kind === "expense" ? params.kind : "saving";
  return (
    <Page title="Create goal" back="/goals">
      <GoalName>
      <Tabs defaultValue={initial}>
        <TabsList className="grid h-11 w-full grid-cols-3 rounded-full bg-muted p-1">
          <TabsTrigger value="saving" className="rounded-full">Saving</TabsTrigger>
          <TabsTrigger value="flow" className="rounded-full">Flow</TabsTrigger>
          <TabsTrigger value="expense" className="rounded-full">Expense</TabsTrigger>
        </TabsList>
        <TabsContent value="saving" className="mt-4">
          <KindIntro kind="saving" />
          <SavingForm people={data.people} me={data.me.address} choices={choices} />
        </TabsContent>
        <TabsContent value="flow" className="mt-4">
          <KindIntro kind="flow" />
          <StreamForm kind="flow" people={data.people} me={data.me.address} choices={choices} />
        </TabsContent>
        <TabsContent value="expense" className="mt-4">
          <KindIntro kind="expense" />
          <StreamForm kind="expense" people={data.people} me={data.me.address} choices={choices} />
        </TabsContent>
      </Tabs>
      </GoalName>
    </Page>
  );
}
