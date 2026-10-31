import { createHmac } from "node:crypto";
import { getAddress, isAddress } from "viem";

export type MobileNetwork = "MTN" | "AIRTEL";

type Env = Record<string, string | undefined>;

export type MobileMoneyStart = {
  network: MobileNetwork;
  phoneNumber: string;
  accountName: string;
  fiatAmount: number;
  receiverAddress: string;
  referenceId: string;
  callbackUrl?: string;
};

export type ProviderStatus = {
  id: string;
  label: string;
  configured: boolean;
  missing: string[];
};

const ugxCap = 20_000_000;

export function readMobileNetwork(value: string): MobileNetwork {
  if (value === "MTN" || value === "AIRTEL") return value;
  throw new Error("Pick MTN MoMo or Airtel Money.");
}

/** Uganda MSISDN in E.164. Accepts 0772…, 256772…, and +256772… */
export function ugandaPhone(value: string): string {
  const compact = value.replace(/[\s()-]/g, "");
  let next = compact;
  if (next.startsWith("0")) next = `+256${next.slice(1)}`;
  else if (next.startsWith("256")) next = `+${next}`;
  else if (next.startsWith("+256")) next = next;
  if (!/^\+256\d{9}$/.test(next)) throw new Error("Enter a Uganda mobile number.");
  return next;
}

export function readUgx(value: string): number {
  const clean = value.replace(/,/g, "").trim();
  if (!/^\d+$/.test(clean)) throw new Error("Enter the amount in UGX.");
  const amount = Number(clean);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > ugxCap) {
    throw new Error("Enter a UGX amount up to 20,000,000.");
  }
  return amount;
}

export function readAccountName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) throw new Error("Enter the name on the mobile-money account.");
  return name;
}

/**
 * Kotani Pay onramp body. Fiat is collected in Uganda and USDC is sent on Base
 * to `receiverAddress`. Shape follows POST /api/v3/onramp.
 */
export function kotaniOnrampBody(input: MobileMoneyStart) {
  return {
    mobileMoney: {
      phoneNumber: input.phoneNumber,
      accountName: input.accountName,
      providerNetwork: input.network,
    },
    currency: "UGX",
    country: "UG",
    fiatAmount: input.fiatAmount,
    chain: "BASE",
    token: "USDC",
    receiverAddress: input.receiverAddress,
    referenceId: input.referenceId,
    ...(input.callbackUrl ? { callbackUrl: input.callbackUrl } : {}),
  };
}

export function kotaniStatus(env: Env): ProviderStatus {
  const missing = env.KOTANI_API_KEY ? [] : ["KOTANI_API_KEY"];
  return { id: "kotani", label: "Kotani Pay", configured: missing.length === 0, missing };
}

export function kotaniBaseUrl(env: Env): string {
  const configured = env.KOTANI_API_BASE?.trim();
  return (configured || "https://sandbox-api.kotanipay.com").replace(/\/$/, "");
}

export function transakStatus(env: Env): ProviderStatus {
  const missing: string[] = [];
  if (!env.TRANSAK_API_KEY && !env.NEXT_PUBLIC_TRANSAK_API_KEY) missing.push("TRANSAK_API_KEY or NEXT_PUBLIC_TRANSAK_API_KEY");
  if (!env.TRANSAK_ACCESS_TOKEN) missing.push("TRANSAK_ACCESS_TOKEN");
  return { id: "transak", label: "Transak", configured: missing.length === 0, missing };
}

export function transakApiKey(env: Env): string {
  return env.TRANSAK_API_KEY?.trim() || env.NEXT_PUBLIC_TRANSAK_API_KEY?.trim() || "";
}

export function transakSessionEndpoint(env: Env): string {
  return env.TRANSAK_ENV === "staging"
    ? "https://api-gateway-stg.transak.com/api/v2/auth/session"
    : "https://api-gateway.transak.com/api/v2/auth/session";
}

/** Widget params stored by Transak's Create Widget URL API. The access token stays on the server. */
export function transakWidgetParams(input: {
  apiKey: string;
  referrerDomain: string;
  walletAddress: string;
  fiatAmount?: number;
}) {
  return {
    apiKey: input.apiKey,
    referrerDomain: input.referrerDomain,
    productsAvailed: "BUY",
    cryptoCurrencyCode: "USDC",
    network: "base",
    walletAddress: input.walletAddress,
    disableWalletAddressForm: true,
    fiatCurrency: "USD",
    ...(input.fiatAmount && input.fiatAmount > 0 ? { fiatAmount: input.fiatAmount } : {}),
  };
}

export function coinbaseStatus(env: Env): ProviderStatus {
  const missing: string[] = [];
  if (!env.COINBASE_CDP_API_KEY_NAME) missing.push("COINBASE_CDP_API_KEY_NAME");
  if (!env.COINBASE_CDP_API_KEY_SECRET) missing.push("COINBASE_CDP_API_KEY_SECRET");
  return { id: "coinbase", label: "Coinbase Onramp", configured: missing.length === 0, missing };
}

export function coinbaseOnrampUrl(sessionToken: string, partnerUserRef: string, redirectUrl?: string): string {
  const url = new URL("https://pay.coinbase.com/buy/select-asset");
  url.searchParams.set("sessionToken", sessionToken);
  if (partnerUserRef) url.searchParams.set("partnerUserRef", partnerUserRef);
  if (redirectUrl) url.searchParams.set("redirectUrl", redirectUrl);
  return url.toString();
}

export function coinbaseTokenBody(address: string, clientIp?: string) {
  return {
    addresses: [{ address, blockchains: ["base"] }],
    assets: ["USDC"],
    ...(clientIp ? { clientIp } : {}),
  };
}

export function referrerDomain(env: Env, requestHost: string): string {
  const configured = env.TRANSAK_REFERRER_DOMAIN?.trim();
  if (configured) return configured.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return requestHost.replace(/:\d+$/, "");
}

/** Merchant source from the Fonbnk dashboard. Orders match this account. */
export const FONBNK_SOURCE_DEFAULT = "6a1063bce738a4967b21f557";

export type FonbnkSide = "buy" | "sell";

export const fonbnkCountries = [
  { id: "UG", label: "Uganda" },
  { id: "KE", label: "Kenya" },
  { id: "NG", label: "Nigeria" },
  { id: "GH", label: "Ghana" },
  { id: "TZ", label: "Tanzania" },
  { id: "ZA", label: "South Africa" },
] as const;

export function fonbnkSource(env: Env): string {
  return env.FONBNK_SOURCE?.trim() || FONBNK_SOURCE_DEFAULT;
}

export function fonbnkStatus(env: Env): ProviderStatus {
  const source = fonbnkSource(env);
  const secret = env.FONBNK_URL_SECRET?.trim() ?? "";
  const missing = [
    ...(source ? [] : ["FONBNK_SOURCE"]),
    ...(secret ? [] : ["FONBNK_URL_SECRET"]),
  ];
  return { id: "fonbnk", label: "Fonbnk", configured: missing.length === 0, missing };
}

export function fonbnkPayOrigin(env: Env): string {
  return env.FONBNK_ENV === "sandbox" ? "https://sandbox-pay.fonbnk.com" : "https://pay.fonbnk.com";
}

export function fonbnkCountry(value: string): string | undefined {
  const code = value.trim().toUpperCase();
  if (!code) return undefined;
  if (!/^[A-Z]{2}$/.test(code)) throw new Error("Pick a country.");
  return code;
}

export function fonbnkLocalAmount(value: string): string | undefined {
  const clean = value.replace(/,/g, "").trim();
  if (!clean) return undefined;
  if (!/^\d+$/.test(clean) || clean === "0") throw new Error("Enter a whole amount in local currency, or leave it blank.");
  return clean;
}

export function fonbnkHs256(secret: string, payload: Record<string, string | number>, now = Math.floor(Date.now() / 1000)): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ ...payload, iat: now, exp: now + 3600 })).toString("base64url");
  const sig = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function fonbnkWidgetUrl(input: {
  origin: string;
  source: string;
  secret?: string;
  side: FonbnkSide;
  address: string;
  amount?: string;
  countryIsoCode?: string;
  orderParams: string;
  callbackUrl?: string;
  now?: number;
}): string {
  if (!isAddress(input.address)) throw new Error("Sign in with a passkey first.");
  if (!input.amount || !input.countryIsoCode) throw new Error("Amount and country are required.");
  const address = getAddress(input.address);
  const buy = input.side !== "sell";
  const url = new URL(buy ? `${input.origin}/auth` : `${input.origin}/offramp/auth`);
  url.searchParams.set("source", input.source);
  url.searchParams.set("network", "CELO");
  url.searchParams.set("asset", "USDT");
  url.searchParams.set("paymentChannel", "mobile_money");
  url.searchParams.set("countryIsoCode", input.countryIsoCode);
  url.searchParams.set("amount", input.amount);
  url.searchParams.set("currency", "local");
  url.searchParams.set("freezeAmount", "true");
  url.searchParams.set("hideSwitch", "true");
  url.searchParams.set("orderParams", input.orderParams);
  if (buy) {
    url.searchParams.set("address", address);
    url.searchParams.set("freezeWallet", "true");
  }
  if (input.callbackUrl) {
    url.searchParams.set("callbackUrl", input.callbackUrl);
    url.searchParams.set("callbackBtnText", "Back to Rvess");
  }
  if (input.secret) {
    url.searchParams.set(
      "signature",
      fonbnkHs256(
        input.secret,
        {
          uid: input.orderParams,
          network: "CELO",
          asset: "USDT",
          paymentChannel: "mobile_money",
          countryIsoCode: input.countryIsoCode,
          amount: input.amount,
          currency: "local",
          ...(buy ? { address, freezeWallet: "true" } : {}),
        },
        input.now,
      ),
    );
  }
  return url.toString();
}
