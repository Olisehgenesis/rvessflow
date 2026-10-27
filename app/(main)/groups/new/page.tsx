import { DraftTerms } from "@/components/circle";
import { GroupUpgradeNote } from "@/components/group-upgrade";
import { KindIntro } from "@/components/product";
import { Page } from "@/components/ui-bits";

export default function NewGroupPage() {
  return (
    <Page title="New group" back="/groups">
      <div className="mb-4">
        <GroupUpgradeNote />
      </div>
      <KindIntro kind="group" />
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Create the group, add people by wallet address, or by the email, phone, or password linked to their wallet, set the order, then start it.
      </p>
      <DraftTerms />
    </Page>
  );
}
