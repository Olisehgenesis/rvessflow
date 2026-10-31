import { ErrorScreen } from "@/components/error-screen";
import { Page } from "@/components/ui-bits";

export default function MainNotFound() {
  return (
    <Page title="Missing">
      <ErrorScreen
        kind="lost"
        title="Nothing at this address"
        body="That group, goal, or lock is not here. It may have finished, or the link is wrong."
        action="Go home"
        href="/home"
      />
    </Page>
  );
}
