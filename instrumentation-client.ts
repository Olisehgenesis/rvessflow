import posthog from "posthog-js";

const posthogProjectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

try {
  if (!posthogProjectToken || !posthogHost) {
    if (process.env.NODE_ENV === "development") {
      const missingPostHogVariable = !posthogProjectToken ? "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN" : "NEXT_PUBLIC_POSTHOG_HOST";
      throw new Error(
        `${missingPostHogVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingPostHogVariable} is configured`,
      );
    }
  } else {
    posthog.init(posthogProjectToken, {
      api_host: posthogHost,
      defaults: "2026-08-30",
      capture_exceptions: true,
      debug: process.env.NEXT_PUBLIC_POSTHOG_DEBUG === "1",
    });
  }
} catch (error) {
  if (process.env.NODE_ENV === "development") throw error;
}
