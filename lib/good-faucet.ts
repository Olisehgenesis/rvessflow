import "server-only";

import { createPublicClient, type Address } from "viem";
import { celo } from "viem/chains";
import { celoTransport } from "@/lib/network";
import { CELO_FAUCET, GOOD_SERVER, belowFaucetNeed, faucetAbi } from "@/lib/good-fv";
import { loadIdentity } from "@/lib/good-identity";

const reader = createPublicClient({ chain: celo, transport: celoTransport() });
const hour = 60 * 60 * 1000;
const lastTop = new Map<string, number>();

export type FaucetResult = "skipped" | "topped" | "error";

export async function topCeloFaucet(account: Address): Promise<FaucetResult> {
  const key = account.toLowerCase();
  const recent = lastTop.get(key);
  if (recent && Date.now() - recent < hour) return "skipped";

  const identity = await loadIdentity(account);
  if (!identity.verified) return "skipped";

  try {
    const [balance, canTop, toppingAmount, minTopping] = await Promise.all([
      reader.getBalance({ address: account }),
      reader.readContract({ address: CELO_FAUCET, abi: faucetAbi, functionName: "canTop", args: [account] }),
      reader.readContract({ address: CELO_FAUCET, abi: faucetAbi, functionName: "getToppingAmount" }),
      reader.readContract({ address: CELO_FAUCET, abi: faucetAbi, functionName: "minTopping" }),
    ]);
    if (!canTop || !belowFaucetNeed(balance, toppingAmount, Number(minTopping))) {
      lastTop.set(key, Date.now());
      return "skipped";
    }
    const response = await fetch(`${GOOD_SERVER}/verify/topWallet`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chainId: 42220, account }),
    });
    if (!response.ok) return "error";
    lastTop.set(key, Date.now());
    return "topped";
  } catch {
    return "error";
  }
}
