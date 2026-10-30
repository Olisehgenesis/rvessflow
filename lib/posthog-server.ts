import "server-only";

import { PostHog } from "posthog-node";

let client: PostHog | null | undefined;

function getPostHogClient() {
  if (client !== undefined) return client;

  const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!projectToken || !host) {
    if (process.env.NODE_ENV === "development") {
      const missingVariable = !projectToken ? "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN" : "NEXT_PUBLIC_POSTHOG_HOST";
      throw new Error(
        `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
      );
    }
    client = null;
    return client;
  }

  client = new PostHog(projectToken, {
    host,
    enableExceptionAutocapture: true,
    flushAt: 1,
    flushInterval: 0,
  });
  return client;
}

export async function captureServerEvent(distinctId: string, event: string, properties?: Record<string, string | number | boolean>) {
  const posthog = getPostHogClient();
  if (!posthog) return;

  try {
    posthog.capture({ distinctId, event, properties });
    await posthog.flush();
  } catch {
    // Analytics delivery must not interrupt a financial action.
  }
}

export async function captureServerException(error: unknown, properties?: Record<string, string>) {
  const posthog = getPostHogClient();
  if (!posthog) return;

  try {
    posthog.captureException(error, undefined, properties);
    await posthog.flush();
  } catch {
    // Error reporting must not hide the original failure.
  }
}
