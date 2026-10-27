import { CreateGroup } from "@/components/create-group";
import { GroupUpgradeNote } from "@/components/group-upgrade";
import { Page } from "@/components/ui-bits";

export default function NewGroupPage() {
  return (
    <Page title="Create group" back="/groups">
      <div className="mb-4">
        <GroupUpgradeNote />
      </div>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">Set the terms, review them, then add the people who will take turns.</p>
      <CreateGroup />
    </Page>
  );
}
