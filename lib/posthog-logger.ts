import "server-only";

import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";

function missingPostHogEnv() {
  if (process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN && process.env.NEXT_PUBLIC_POSTHOG_HOST) return null;
  return !process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ? "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN" : "NEXT_PUBLIC_POSTHOG_HOST";
}

function createLoggerProvider() {
  const missing = missingPostHogEnv();
  if (missing) {
    if (process.env.NODE_ENV === "development") {
      throw new Error(
        `${missing} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missing} is configured`,
      );
    }
    return null;
  }

  const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN as string;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST as string;
  return new LoggerProvider({
    resource: resourceFromAttributes({ "service.name": "rvess-web" }),
    processors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({
          url: `${host}/i/v1/logs`,
          headers: {
            Authorization: `Bearer ${projectToken}`,
            "Content-Type": "application/json",
          },
        }),
      }),
    ],
  });
}

export const loggerProvider = createLoggerProvider();
const logger = loggerProvider?.getLogger("rvess-posthog-logs");

type LogAttributes = Record<string, string | number | boolean>;

export function registerPostHogLogs() {
  if (process.env.NEXT_RUNTIME === "nodejs" && loggerProvider) {
    logs.setGlobalLoggerProvider(loggerProvider);
  }
}

export async function logPostHogInfo(message: string, attributes: LogAttributes) {
  if (!logger || !loggerProvider) return;

  try {
    logger.emit({ body: message, severityNumber: SeverityNumber.INFO, attributes });
    await loggerProvider.forceFlush();
  } catch {
    // Log delivery must not interrupt a financial action.
  }
}
