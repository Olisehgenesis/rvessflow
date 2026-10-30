import "server-only";

import { createPublicClient, formatEther, type Address } from "viem";
import { celo } from "viem/chains";
import { celoTransport } from "@/lib/network";
import { GOOD_SERVER, belowCeloTopFloor } from "@/lib/good-fv";
import { loadIdentity } from "@/lib/good-identity";

const reader = createPublicClient({ chain: celo, transport: celoTransport() });
const coolOff = 10 * 60 * 1000;
const lastTop = new Map<string, number>();

export type FaucetResult = "skipped" | "topped" | "error";

function heldLabel(balance: bigint) {
  const held = Number(formatEther(balance));
  return `${held < 0.0001 ? held.toFixed(6) : held.toFixed(4)} CELO`;
}

/**
 * Same request and `ok` codes as SovAds (`/api/topWallet` → GoodServer).
 * `ok > 0` topped, `ok === 0` already enough, `ok < 0` refused.
 */
async function postTopWallet(account: Address): Promise<number> {
  const response = await fetch(`${GOOD_SERVER}/verify/topWallet`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chainId: 42220, account }),
  });
  const data = (await response.json().catch(() => ({ ok: -1 }))) as { ok?: number };
  if (typeof data.ok === "number") return data.ok;
  return response.ok ? 1 : -1;
}

/** Verified wallet on Celo with less than 0.3 CELO. */
export async function topCeloFaucet(account: Address): Promise<FaucetResult> {
  const key = account.toLowerCase();
  const recent = lastTop.get(key);
  if (recent && Date.now() - recent < coolOff) return "skipped";

  try {
    const identity = await loadIdentity(account);
    if (!identity.verified) return "skipped";
    const balance = await reader.getBalance({ address: account });
    if (!belowCeloTopFloor(balance)) return "skipped";
    const code = await postTopWallet(account);
    if (code > 0) {
      lastTop.set(key, Date.now());
      return "topped";
    }
    if (code === 0) return "skipped";
    return "error";
  } catch {
    return "error";
  }
}

export type FaucetAsk = { ok: boolean; detail: string; tone: "ok" | "info" | "error" };

/** Explicit tap: POST GoodDollar topWallet and surface their `ok` code. */
export async function requestCeloFaucet(account: Address): Promise<FaucetAsk> {
  try {
    const identity = await loadIdentity(account);
    if (!identity.verified) {
      return { ok: false, tone: "error", detail: "GoodDollar only tops a verified wallet." };
    }
    const balance = await reader.getBalance({ address: account });
    const label = heldLabel(balance);
    const code = await postTopWallet(account);
    if (code > 0) {
      lastTop.set(account.toLowerCase(), Date.now());
      return { ok: true, tone: "ok", detail: `GoodDollar sent CELO to this wallet. It held ${label} on Celo.` };
    }
    if (code === 0) {
      return { ok: false, tone: "info", detail: `GoodDollar says gas is already sufficient. This wallet holds ${label} on Celo.` };
    }
    return { ok: false, tone: "error", detail: "GoodDollar did not send CELO. Try again in a bit." };
  } catch {
    return { ok: false, tone: "error", detail: "GoodDollar did not send CELO. Try again in a bit." };
  }
}
