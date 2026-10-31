import { ErrorScreen } from "@/components/error-screen";

export default function NotFound() {
  return (
    <ErrorScreen
      kind="lost"
      title="That page is not here"
      body="The link may be old, or the group was removed. Home still works."
      action="Go home"
      href="/"
    />
  );
}
