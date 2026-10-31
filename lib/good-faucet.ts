import "server-only";

import { createPublicClient, createWalletClient, formatEther, parseEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { celoTransport } from "@/lib/network";
import { GOOD_SERVER, belowCeloTopFloor } from "@/lib/good-fv";
import { loadIdentity } from "@/lib/good-identity";

const reader = createPublicClient({ chain: celo, transport: celoTransport() });
const coolOff = 10 * 60 * 1000;
const lastTop = new Map<string, number>();
/** Enough for a few Kernel userOps. Less than GoodDollar's 0.3 CELO target. */
const APP_TOP_WEI = parseEther("0.05");

export type FaucetResult = "skipped" | "topped" | "error";

function heldLabel(balance: bigint) {
  const held = Number(formatEther(balance));
  return `${held < 0.0001 ? held.toFixed(6) : held.toFixed(4)} CELO`;
}

function topKey() {
  const raw = (process.env.CELO_TOP_KEY || process.env.PRIVATE_KEY || "").trim();
  if (!raw) return null;
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
}

async function isContractWallet(account: Address) {
  const code = await reader.getCode({ address: account });
  return Boolean(code && code !== "0x");
}

/**
 * Same request and `ok` codes as SovAds (`/api/topWallet` → GoodServer).
 * `ok > 0` claimed success (they also return this when they skip a reverting top),
 * `ok === 0` already enough, `ok < 0` refused.
 */
async function postTopWallet(account: Address): Promise<{ code: number; error: string }> {
  const response = await fetch(`${GOOD_SERVER}/verify/topWallet`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chainId: 42220, account }),
  });
  const data = (await response.json().catch(() => ({ ok: -1 }))) as { ok?: number; error?: string };
  const code = typeof data.ok === "number" ? data.ok : response.ok ? 1 : -1;
  return { code, error: typeof data.error === "string" ? data.error : "" };
}

async function waitBalance(account: Address) {
  await new Promise((resolve) => setTimeout(resolve, 2500));
  return reader.getBalance({ address: account });
}

/**
 * Kernel / ERC-1967 passkeys cannot take GoodDollar's faucet `.transfer()` (2300 gas).
 * A normal `CALL` from an app key can.
 */
async function sendAppCelo(account: Address, amount: bigint): Promise<boolean> {
  const key = topKey();
  if (!key) return false;
  const signer = privateKeyToAccount(key);
  const held = await reader.getBalance({ address: signer.address });
  if (held < amount + parseEther("0.01")) return false;
  const wallet = createWalletClient({ account: signer, chain: celo, transport: celoTransport() });
  const hash = await wallet.sendTransaction({ to: account, value: amount });
  const receipt = await reader.waitForTransactionReceipt({ hash });
  return receipt.status === "success";
}

async function fillIfStillShort(account: Address, before: bigint) {
  const afterGd = await waitBalance(account);
  if (afterGd > before) return { topped: true as const, balance: afterGd, via: "gooddollar" as const };
  const need = APP_TOP_WEI > afterGd ? APP_TOP_WEI - afterGd : 0n;
  if (need === 0n) return { topped: false as const, balance: afterGd, via: "none" as const };
  if (!(await isContractWallet(account))) {
    return { topped: false as const, balance: afterGd, via: "none" as const };
  }
  const sent = await sendAppCelo(account, need);
  const afterApp = sent ? await reader.getBalance({ address: account }) : afterGd;
  if (afterApp > afterGd) return { topped: true as const, balance: afterApp, via: "app" as const };
  return { topped: false as const, balance: afterApp, via: "blocked" as const };
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
    await postTopWallet(account);
    const fill = await fillIfStillShort(account, balance);
    if (fill.topped) {
      lastTop.set(key, Date.now());
      return "topped";
    }
    return "error";
  } catch {
    return "error";
  }
}

export type FaucetAsk = { ok: boolean; detail: string; tone: "ok" | "info" | "error" };

/** Explicit tap: POST GoodDollar topWallet, then top a passkey ourselves if their faucet cannot. */
export async function requestCeloFaucet(account: Address): Promise<FaucetAsk> {
  try {
    const identity = await loadIdentity(account);
    if (!identity.verified) {
      return { ok: false, tone: "error", detail: "GoodDollar only tops a verified wallet." };
    }
    const before = await reader.getBalance({ address: account });
    const label = heldLabel(before);
    const posted = await postTopWallet(account);
    const fill = await fillIfStillShort(account, before);
    if (fill.topped) {
      lastTop.set(account.toLowerCase(), Date.now());
      const now = heldLabel(fill.balance);
      if (fill.via === "app") {
        return { ok: true, tone: "ok", detail: `Sent ${now} with a full Celo transfer. GoodDollar's faucet cannot pay a passkey (their contract uses a 2300-gas transfer). It held ${label} before.` };
      }
      return { ok: true, tone: "ok", detail: `GoodDollar sent CELO to this wallet. It now holds ${now}.` };
    }
    if (posted.code === 0 && !belowCeloTopFloor(fill.balance)) {
      return { ok: false, tone: "info", detail: `GoodDollar says gas is already sufficient. This wallet holds ${heldLabel(fill.balance)} on Celo.` };
    }
    if (fill.via === "blocked") {
      return {
        ok: false,
        tone: "error",
        detail: `This passkey still holds ${heldLabel(fill.balance)} on Celo. GoodDollar's faucet cannot pay a smart wallet (their send uses 2300 gas and reverts). App actions keep using sponsored gas.`,
      };
    }
    if (posted.code < 0 && posted.error) {
      return { ok: false, tone: "error", detail: `GoodDollar did not send CELO (${posted.error}). This wallet holds ${heldLabel(fill.balance)} on Celo.` };
    }
    return { ok: false, tone: "error", detail: `GoodDollar did not send CELO. This wallet still holds ${heldLabel(fill.balance)} on Celo.` };
  } catch {
    return { ok: false, tone: "error", detail: "GoodDollar did not send CELO. Try again in a bit." };
  }
}
