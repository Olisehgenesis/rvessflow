import "server-only";

import { createPublicClient, formatEther, type Address } from "viem";
import { celo } from "viem/chains";
import { celoTransport } from "@/lib/network";
import { CELO_FAUCET, GOOD_SERVER, belowCeloTopFloor, faucetAbi } from "@/lib/good-fv";
import { loadIdentity } from "@/lib/good-identity";

const reader = createPublicClient({ chain: celo, transport: celoTransport() });
const coolOff = 10 * 60 * 1000;
const lastTop = new Map<string, number>();

export type FaucetResult = "skipped" | "topped" | "error";

function heldLabel(balance: bigint) {
  const held = Number(formatEther(balance));
  return `${held < 0.0001 ? held.toFixed(6) : held.toFixed(4)} CELO`;
}

async function faucetState(account: Address) {
  const identity = await loadIdentity(account);
  if (!identity.verified) return { verified: false as const };
  const [balance, canTop] = await Promise.all([
    reader.getBalance({ address: account }),
    reader.readContract({ address: CELO_FAUCET, abi: faucetAbi, functionName: "canTop", args: [account] }),
  ]);
  return { verified: true as const, balance, canTop };
}

async function postTopWallet(account: Address) {
  const response = await fetch(`${GOOD_SERVER}/verify/topWallet`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chainId: 42220, account }),
  });
  return response.ok;
}

/** Verified wallet on Celo with less than 0.3 CELO. */
export async function topCeloFaucet(account: Address): Promise<FaucetResult> {
  const key = account.toLowerCase();
  const recent = lastTop.get(key);
  if (recent && Date.now() - recent < coolOff) return "skipped";

  try {
    const state = await faucetState(account);
    if (!state.verified) return "skipped";
    if (!state.canTop || !belowCeloTopFloor(state.balance)) return "skipped";
    if (!(await postTopWallet(account))) return "error";
    lastTop.set(key, Date.now());
    return "topped";
  } catch {
    return "error";
  }
}

export type FaucetAsk = { ok: boolean; detail: string; tone: "ok" | "info" | "error" };

/** Explicit tap: still respects verified + canTop + 0.3 CELO, skips this process's cool-off. */
export async function requestCeloFaucet(account: Address): Promise<FaucetAsk> {
  try {
    const state = await faucetState(account);
    if (!state.verified) {
      return { ok: false, tone: "error", detail: "GoodDollar only tops a verified wallet." };
    }
    const label = heldLabel(state.balance);
    if (!state.canTop) {
      return { ok: false, tone: "info", detail: `GoodDollar will not top this wallet right now. It holds ${label} on Celo.` };
    }
    if (!belowCeloTopFloor(state.balance)) {
      return { ok: false, tone: "info", detail: `This wallet already has ${label} on Celo, which is at least 0.3 CELO.` };
    }
    if (!(await postTopWallet(account))) {
      return { ok: false, tone: "error", detail: "GoodDollar did not send CELO. Try again in a bit." };
    }
    lastTop.set(account.toLowerCase(), Date.now());
    return { ok: true, tone: "ok", detail: "GoodDollar sent CELO to this wallet for Celo network fees." };
  } catch {
    return { ok: false, tone: "error", detail: "GoodDollar did not send CELO. Try again in a bit." };
  }
}
