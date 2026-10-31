import { createHmac } from "node:crypto";

type Env = Record<string, string | undefined>;

export type FonbnkField = {
  key: string;
  label: string;
  required: boolean;
  type?: string;
  options?: { label: string; value: string }[];
};

export type FonbnkKyc = {
  required: boolean;
  url?: string;
  passed?: string;
  offrampKycRequired: boolean;
  message?: string;
};

function padBase64(value: string) {
  return value + "=".repeat((4 - (value.length % 4)) % 4);
}

export function fonbnkApiBase(env: Env): string {
  return env.FONBNK_ENV === "sandbox" ? "https://sandbox-api.fonbnk.com" : "https://api.fonbnk.com";
}

export function fonbnkApiClientId(env: Env): string {
  return env.FONBNK_CLIENT_ID?.trim() || env.FONBNK_SOURCE?.trim() || "";
}

export function fonbnkApiSecret(env: Env): string {
  return env.FONBNK_API_SECRET?.trim() || env.FONBNK_URL_SECRET?.trim() || "";
}

export function fonbnkApiStatus(env: Env) {
  const clientId = fonbnkApiClientId(env);
  const secret = fonbnkApiSecret(env);
  const missing = [...(clientId ? [] : ["FONBNK_CLIENT_ID"]), ...(secret ? [] : ["FONBNK_API_SECRET"])];
  return { configured: missing.length === 0, missing };
}

export function fonbnkFiatCode(country: string): string {
  const map: Record<string, string> = {
    UG: "UGX",
    KE: "KES",
    NG: "NGN",
    GH: "GHS",
    TZ: "TZS",
    ZA: "ZAR",
    EG: "EGP",
    RW: "RWF",
    ZM: "ZMW",
    MW: "MWK",
  };
  return map[country.trim().toUpperCase()] || "UGX";
}

export function fonbnkSign(secret: string, timestamp: string, endpoint: string): string {
  const key = Buffer.from(padBase64(secret), "base64");
  return createHmac("sha256", key).update(`${timestamp}:${endpoint}`).digest("base64");
}

function readError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const row = payload as { message?: unknown; error?: unknown; errors?: unknown };
  if (typeof row.message === "string" && row.message.trim()) return row.message;
  if (typeof row.error === "string" && row.error.trim()) return row.error;
  if (Array.isArray(row.errors) && typeof row.errors[0] === "string") return row.errors[0];
  return fallback;
}

export async function fonbnkRequest(
  env: Env,
  method: "GET" | "POST",
  endpoint: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; payload: unknown }> {
  const clientId = fonbnkApiClientId(env);
  const secret = fonbnkApiSecret(env);
  if (!clientId || !secret) throw new Error("Fonbnk API client id and secret are missing.");
  const timestamp = String(Date.now());
  const response = await fetch(`${fonbnkApiBase(env)}${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-client-id": clientId,
      "x-timestamp": timestamp,
      "x-signature": fonbnkSign(secret, timestamp, endpoint),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function fieldsOf(leg: unknown): FonbnkField[] {
  const list = asRecord(leg).fieldsToCreateOrder;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const row = asRecord(item);
    const key = String(row.key ?? "");
    if (!key || /SandboxForcedFlow$/i.test(key)) return [];
    const options = Array.isArray(row.options)
      ? row.options.flatMap((option) => {
          const choice = asRecord(option);
          return choice.value ? [{ label: String(choice.label || choice.value), value: String(choice.value) }] : [];
        })
      : undefined;
    return [{ key, label: String(row.label || key), required: row.required !== false, type: String(row.type || "string"), options }];
  });
}

export async function fonbnkQuoteOfframp(env: Env, input: { country: string; amount: number; channel?: "mobile_money" | "bank" }) {
  const country = input.country.toUpperCase();
  const body = {
    deposit: { paymentChannel: "crypto", currencyType: "crypto", currencyCode: "CELO_USDT" },
    payout: {
      paymentChannel: input.channel || "mobile_money",
      currencyType: "fiat",
      currencyCode: fonbnkFiatCode(country),
      countryIsoCode: country,
      amount: input.amount,
    },
  };
  let result = await fonbnkRequest(env, "POST", "/api/v2/quote", body);
  if (result.status >= 400 && !input.channel) {
    result = await fonbnkRequest(env, "POST", "/api/v2/quote", {
      ...body,
      payout: { ...body.payout, paymentChannel: "bank" },
    });
  }
  if (result.status >= 400) throw new Error(readError(result.payload, `Fonbnk quote failed (${result.status}).`));
  const quote = asRecord(result.payload);
  const deposit = asRecord(quote.deposit);
  const payout = asRecord(quote.payout);
  const send = asRecord(deposit.cashout);
  const receive = asRecord(payout.cashout);
  return {
    quoteId: String(quote.quoteId ?? ""),
    sendUsdt: String(send.amountBeforeFees ?? ""),
    receiveLocal: String(receive.amountAfterFees ?? input.amount),
    depositUsd: Number(send.amountBeforeFeesUsd ?? 0),
    payoutUsd: Number(receive.amountAfterFeesUsd ?? 0),
    channel: String(payout.paymentChannel || "mobile_money"),
    fields: [...fieldsOf(deposit), ...fieldsOf(payout)],
  };
}

export async function fonbnkKycState(
  env: Env,
  input: {
    email: string;
    country: string;
    callbackUrl: string;
    depositUsd?: number;
    payoutUsd?: number;
  },
): Promise<FonbnkKyc> {
  const query = new URLSearchParams({ userEmail: input.email, countryIsoCode: input.country.toUpperCase(), callbackUrl: input.callbackUrl, callbackBtnText: "Back to Rvess" });
  if (input.depositUsd && input.payoutUsd) {
    query.set("depositCurrencyType", "crypto");
    query.set("payoutCurrencyType", "fiat");
    query.set("depositAmountUsd", String(input.depositUsd));
    query.set("payoutAmountUsd", String(input.payoutUsd));
  }
  const endpoint = `/api/v2/user/kyc?${query.toString()}`;
  const result = await fonbnkRequest(env, "GET", endpoint);
  if (result.status >= 400) {
    return {
      required: true,
      offrampKycRequired: true,
      message: readError(result.payload, `Fonbnk KYC failed (${result.status}). Create-users may be off for this merchant.`),
    };
  }
  const row = asRecord(result.payload);
  const urls = asRecord(row.kycUrls);
  const needed = row.requiredKycType == null || row.requiredKycType === "" ? null : String(row.requiredKycType);
  const passed = row.passedKycType ? String(row.passedKycType) : undefined;
  const url = needed === "advanced" ? String(urls.advanced || urls.basic || "") : String(urls.basic || urls.advanced || "");
  return {
    required: Boolean(needed),
    url: url || undefined,
    passed,
    offrampKycRequired: Boolean(row.offrampKycRequired),
    message: typeof row.message === "string" ? row.message : undefined,
  };
}

function detail(list: unknown, id: string) {
  if (!Array.isArray(list)) return "";
  const row = list.find((item) => asRecord(item).id === id);
  return row ? String(asRecord(row).value ?? "") : "";
}

export async function fonbnkCreateOfframpOrder(
  env: Env,
  input: {
    quoteId: string;
    email: string;
    ip: string;
    country: string;
    amount: number;
    address: string;
    channel: string;
    fields: Record<string, string>;
  },
) {
  const country = input.country.toUpperCase();
  const result = await fonbnkRequest(env, "POST", "/api/v2/order", {
    quoteId: input.quoteId,
    userEmail: input.email,
    userCountryIsoCode: country,
    userIp: input.ip,
    deposit: { paymentChannel: "crypto", currencyType: "crypto", currencyCode: "CELO_USDT" },
    payout: {
      paymentChannel: input.channel,
      currencyType: "fiat",
      currencyCode: fonbnkFiatCode(country),
      countryIsoCode: country,
      amount: input.amount,
    },
    fieldsToCreateOrder: { ...input.fields, blockchainWalletAddress: input.address },
    orderParams: `rvess-${crypto.randomUUID()}`,
  });
  if (result.status >= 400) throw new Error(readError(result.payload, `Fonbnk could not create the order (${result.status}).`));
  const order = asRecord(asRecord(result.payload).order);
  const deposit = asRecord(order.deposit);
  const instructions = asRecord(deposit.transferInstructions);
  const details = instructions.transferDetails;
  return {
    orderId: String(order._id ?? ""),
    status: String(order.status ?? ""),
    to: detail(details, "recipientWalletAddress"),
    amount: detail(details, "amountToSend"),
    text: String(instructions.instructionsText ?? "Send Celo USDT from this passkey. Do not connect MetaMask."),
  };
}

export async function fonbnkConfirmOrder(env: Env, orderId: string, hash: string) {
  const result = await fonbnkRequest(env, "POST", "/api/v2/order/confirm", {
    orderId,
    fieldsToConfirmOrder: { blockchainTransactionHash: hash },
  });
  if (result.status >= 400) throw new Error(readError(result.payload, `Fonbnk could not confirm the send (${result.status}).`));
  return asRecord(result.payload);
}
