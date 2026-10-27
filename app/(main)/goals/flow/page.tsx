import { Suspense } from "react";
import Loading from "../../loading";
import { PlanList } from "@/components/plan-list";

export default function FlowPage() {
  return (
    <Suspense fallback={<Loading />}>
      <PlanList
        kind="flow"
        title="Flow"
        back="/goals"
        createHref="/goals/new?kind=flow"
        createLabel="New flow"
        empty="A flow pays you every second until the end date."
        showIncoming
      />
    </Suspense>
  );
}
