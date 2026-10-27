import { Suspense } from "react";
import Loading from "../../../loading";
import { PlanList } from "@/components/plan-list";

export default function StreamingExpensePage() {
  return (
    <Suspense fallback={<Loading />}>
      <PlanList
        kind="expense"
        title="Streaming payments"
        back="/goals/expense"
        createHref="/goals/new?kind=expense"
        createLabel="New stream"
        empty="A streaming payment sends money to someone else until the end date."
      />
    </Suspense>
  );
}
