import { CreateGroup } from "@/components/create-group";
import { Page } from "@/components/ui-bits";
import { groupPlainOn } from "@/lib/group-site";

export default async function NewGroupPage() {
  const [celo, base] = await Promise.all([groupPlainOn("celo"), groupPlainOn("base")]);
  return (
    <Page title="Create group" back="/groups">
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">Set the terms, add the people, then start. You will see how much each person posts and when they get paid.</p>
      <CreateGroup live={{ celo: celo.live, base: base.live }} />
    </Page>
  );
}
