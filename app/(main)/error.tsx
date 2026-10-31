"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/error-screen";
import { Page } from "@/components/ui-bits";

export default function MainError({
  error,
  retry,
  reset,
}: {
  error: unknown;
  retry?: () => void;
  reset?: () => void;
}) {
  const again = retry ?? reset;
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Page title="Trouble">
      <ErrorScreen
        kind="broke"
        title="This screen hit a snag"
        body="Savings, groups, and your wallet are still on-chain. Try again, or go home."
        action="Try again"
        href="/home"
        onAction={again}
      />
    </Page>
  );
}
