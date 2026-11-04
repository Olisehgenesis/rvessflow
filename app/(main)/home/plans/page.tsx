import { Suspense } from "react";
import Loading from "../../loading";
import { OpenPlans } from "@/components/plan-list";

export default function PlansPage() {
  return (
    <Suspense fallback={<Loading />}>
      <OpenPlans />
    </Suspense>
  );
}
