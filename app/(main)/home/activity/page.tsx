import { Suspense } from "react";
import Loading from "../../loading";
import { ActivityList } from "@/components/activity-list";
import { Page } from "@/components/ui-bits";
import { loadActivity } from "@/lib/activity";
import { loadQuote } from "@/lib/rates";
import { loadPortfolio } from "@/lib/protocol";
import { viewer } from "@/lib/session";

export default function ActivityPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ActivityBody />
    </Suspense>
  );
}

async function ActivityBody() {
  const who = await viewer();
  const [data, quote] = await Promise.all([loadPortfolio(who), loadQuote()]);
  let activity: Awaited<ReturnType<typeof loadActivity>> = [];
  try {
    activity = await loadActivity(who.address, data);
  } catch {
    activity = [];
  }
  return (
    <Page title="Activity" back="/home">
      <ActivityList items={activity} quote={quote} />
    </Page>
  );
}
