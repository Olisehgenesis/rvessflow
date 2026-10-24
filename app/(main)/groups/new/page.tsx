import { DraftTerms } from "@/components/circle";
import { KindIntro } from "@/components/product";
import { Page } from "@/components/ui-bits";

export default function NewGroupPage() {
  return (
    <Page title="New group" back="/groups">
      <KindIntro kind="group" />
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Create the group, add people by the email, phone, or password linked to their wallet, set the order, then start it.
      </p>
      <DraftTerms />
    </Page>
  );
}
