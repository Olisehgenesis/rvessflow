"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/error-screen";

export default function ErrorPage({
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
    <ErrorScreen
      kind="broke"
      title="Something broke"
      body="The page did not finish loading. Try again, or go home and pick up where you left off."
      action="Try again"
      onAction={again}
    />
  );
}
