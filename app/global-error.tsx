"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

export default function GlobalError({
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
    try {
      posthog.captureException(error);
    } catch {
      // Analytics should not block the recovery screen.
    }
  }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100dvh", background: "#F7F6F3", color: "#141414", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
        <div style={{ display: "flex", minHeight: "100dvh", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "3rem 1.5rem", textAlign: "center" }}>
          <img src="/assets/groups/lock-vault.jpg" alt="" width={112} height={112} style={{ width: 112, height: 112, borderRadius: 26, objectFit: "contain" }} />
          <h1 style={{ margin: "1.25rem 0 0", fontSize: "1.5rem", letterSpacing: "-0.04em" }}>Something broke</h1>
          <p style={{ margin: "0.5rem 0 0", maxWidth: 360, fontSize: 14, lineHeight: 1.5, color: "#5C6572" }}>
            The app hit an error on this device. Try again. Your money on Celo and Base is unchanged.
          </p>
          <button
            type="button"
            onClick={() => again?.()}
            style={{
              marginTop: 24,
              height: 48,
              minWidth: 160,
              border: 0,
              borderRadius: 999,
              background: "#D6F34A",
              fontSize: 14,
              fontWeight: 600,
              color: "#141414",
            }}
          >
            Try again
          </button>
          <a href="/" style={{ marginTop: 12, fontSize: 14, color: "#5C6572", textDecoration: "none" }}>
            Go home
          </a>
        </div>
      </body>
    </html>
  );
}
