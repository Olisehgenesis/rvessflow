import "server-only";

import { coinbaseJwt } from "@/lib/coinbase-jwt";
import {
  coinbaseOnrampUrl,
  coinbaseStatus,
  coinbaseTokenBody,
  kotaniBaseUrl,
  kotaniOnrampBody,
  kotaniStatus,
  referrerDomain,
  transakApiKey,
  transakSessionEndpoint,
  transakStatus,
  transakWidgetParams,
  type MobileMoneyStart,
} from "@/lib/onramp";

export class OnrampConfigError extends Error {
  missing: string[];
  constructor(missing: string[]) {
    super("This onramp is not configured.");
    this.missing = missing;
  }
}

function clientIp(request: Request): string | undefined {
  const real = request.headers.get("x-real-ip")?.trim() ?? "";
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(real) || /^[0-9a-fA-F:]+$/.test(real)) return real;
  return undefined;
}

export async function startKotaniOnramp(input: MobileMoneyStart): Promise<{ referenceId: string; message: string }> {
  const status = kotaniStatus(process.env);
  if (!status.configured) throw new OnrampConfigError(status.missing);
  const response = await fetch(`${kotaniBaseUrl(process.env)}/api/v3/onramp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KOTANI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(kotaniOnrampBody(input)),
  });
  const payload = (await response.json().catch(() => null)) as { success?: boolean; message?: string; data?: { referenceId?: string } } | null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.message || "Kotani Pay did not start the mobile-money collection.");
  }
  return {
    referenceId: payload.data?.referenceId || input.referenceId,
    message: payload.message || "Approve the prompt on your phone. USDC is sent on Base after the payment confirms.",
  };
}

export async function startTransak(request: Request, walletAddress: string, fiatAmount?: number): Promise<string> {
  const status = transakStatus(process.env);
  if (!status.configured) throw new OnrampConfigError(status.missing);
  const host = request.headers.get("host") || "localhost";
  const response = await fetch(transakSessionEndpoint(process.env), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "access-token": process.env.TRANSAK_ACCESS_TOKEN || "",
    },
    body: JSON.stringify({
      widgetParams: transakWidgetParams({
        apiKey: transakApiKey(process.env),
        referrerDomain: referrerDomain(process.env, host),
        walletAddress,
        fiatAmount,
      }),
    }),
  });
  const payload = (await response.json().catch(() => null)) as { data?: { widgetUrl?: string }; message?: string; error?: string } | null;
  const widgetUrl = payload?.data?.widgetUrl;
  if (!response.ok || !widgetUrl) {
    throw new Error(payload?.message || payload?.error || "Transak did not return a widget URL.");
  }
  return widgetUrl;
}

export async function startCoinbase(request: Request, walletAddress: string): Promise<string> {
  const status = coinbaseStatus(process.env);
  if (!status.configured) throw new OnrampConfigError(status.missing);
  const keyName = process.env.COINBASE_CDP_API_KEY_NAME || "";
  const secret = process.env.COINBASE_CDP_API_KEY_SECRET || "";
  const jwt = coinbaseJwt(keyName, secret);
  const response = await fetch("https://api.developer.coinbase.com/onramp/v1/token", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify(coinbaseTokenBody(walletAddress, clientIp(request))),
  });
  const payload = (await response.json().catch(() => null)) as { token?: string; message?: string } | null;
  if (!response.ok || !payload?.token) {
    throw new Error(payload?.message || "Coinbase did not return a session token.");
  }
  const partner = process.env.COINBASE_PROJECT_ID?.trim() || walletAddress;
  return coinbaseOnrampUrl(payload.token, partner, process.env.COINBASE_ONRAMP_REDIRECT_URL?.trim());
}
