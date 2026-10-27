import { Suspense } from "react";
import Loading from "../../loading";
import { PlanList } from "@/components/plan-list";

export default function SavingsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <PlanList
        kind="saving"
        title="Saving"
        back="/goals"
        createHref="/goals/new"
        createLabel="New saving"
        empty="A saving locks the money until the date. The number stays still."
      />
    </Suspense>
  );
}
