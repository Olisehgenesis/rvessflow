import { CreateGroup } from "@/components/create-group";
import { GroupUpgradeNote } from "@/components/group-upgrade";
import { Page } from "@/components/ui-bits";
import { plainTurnHint } from "@/lib/group-upgrade";
import { groupPlainOn } from "@/lib/group-site";

export default async function NewGroupPage() {
  const [celo, base] = await Promise.all([groupPlainOn("celo"), groupPlainOn("base")]);
  return (
    <Page title="Create group" back="/groups">
      <div className="mb-4">
        <GroupUpgradeNote />
      </div>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">Set the terms, review them, then add the people who will take turns.</p>
      <CreateGroup
        live={{ celo: celo.live, base: base.live }}
        hints={{ celo: plainTurnHint(celo), base: plainTurnHint(base) }}
      />
    </Page>
  );
}
