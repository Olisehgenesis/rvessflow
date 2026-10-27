import { Suspense } from "react";
import Loading from "../../../loading";
import { Page } from "@/components/ui-bits";

export default function InstantExpensePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Page title="Instant" back="/goals/expense">
        <p className="text-sm leading-relaxed text-muted-foreground">Paying from the wallet right now is not available yet. A streaming expense can be started from the previous screen.</p>
      </Page>
    </Suspense>
  );
}
