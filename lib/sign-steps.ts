import type { Intent, PreparedCall } from "@/lib/intent";
import { celoGasTreasury } from "@/lib/celo-fee";
import { celoMarket } from "@/lib/celo-market";
import { baseMarket } from "@/lib/base-market";

export type StepStatus = "wait" | "run" | "done" | "fail";

export type SignStep = {
  id: string;
  title: string;
  detail: string;
  status: StepStatus;
};

const routers = new Set([
  celoMarket.swapRouter02.toLowerCase(),
  baseMarket.swapRouter02.toLowerCase(),
]);

const labels: Record<string, { id: string; title: string; detail: string }> = {
  "0x5d12928b": { id: "vault", title: "Create your vault", detail: "One-time setup for this account." },
  "0x095ea7b3": { id: "approve", title: "Allow the swap", detail: "The router can spend this token." },
  "0x5ae401dc": { id: "swap", title: "Swap into dollars", detail: "Uniswap turns USDT or CELO into USDm." },
  "0x5023b4df": { id: "swap", title: "Swap into dollars", detail: "Uniswap turns USDT or CELO into USDm." },
  "0x75d0f29f": { id: "deposit", title: "Put dollars in the vault", detail: "The stream spends from this deposit." },
  "0xd2d7e8c5": { id: "deposit", title: "Put dollars in the vault", detail: "The stream spends from this deposit." },
  "0x45977d03": { id: "wrap", title: "Wrap into the stream token", detail: "USDm becomes cUSDx for Superfluid." },
  "0xd67e4147": { id: "open", title: "Open the stream", detail: "Money starts moving every second." },
  "0xb260c42a": { id: "start", title: "Start the stream", detail: "A later start date is now live." },
  "0xd7e05f44": { id: "open", title: "Open the stream", detail: "Money starts moving every second." },
};

function selector(data: string): string {
  return data.slice(0, 10).toLowerCase();
}

function transferTo(data: string): string | null {
  if (selector(data) !== "0xa9059cbb" || data.length < 74) return null;
  return `0x${data.slice(34, 74)}`.toLowerCase();
}

export function labelCall(call: PreparedCall): Omit<SignStep, "status"> {
  const sel = selector(call.data);
  if (sel === "0xa9059cbb") {
    const to = transferTo(call.data);
    if (to === celoGasTreasury.toLowerCase()) {
      return { id: "fee", title: "Celo network fee", detail: "A small USDT, USDC, or USDm transfer pays sponsored gas." };
    }
    return { id: "send", title: "Send tokens", detail: "A transfer in this batch." };
  }
  if (routers.has(call.to.toLowerCase())) {
    return { id: "swap", title: "Swap into dollars", detail: "Uniswap turns USDT or CELO into USDm." };
  }
  return labels[sel] ?? { id: sel || "call", title: "On-chain step", detail: "A contract call in this signature." };
}

export function describeCalls(calls: readonly PreparedCall[]): Omit<SignStep, "status">[] {
  const out: Omit<SignStep, "status">[] = [];
  const seen = new Set<string>();
  for (const call of calls) {
    const item = labelCall(call);
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function headline(intent: Intent): { title: string; body: string } {
  if (intent.kind === "stream") {
    return intent.flowKind === "expense"
      ? { title: "Opening this payment", body: "Each hop has to land before the next. A failed step stays marked so you can see where it stopped." }
      : { title: "Opening this flow", body: "Each hop has to land before the next. A failed step stays marked so you can see where it stopped." };
  }
  if (intent.kind === "saving") {
    return { title: "Saving this amount", body: "Each hop has to land before the next. A failed step stays marked so you can see where it stopped." };
  }
  if (intent.kind === "lock") {
    return { title: "Locking this amount", body: "Each hop has to land before the next. A failed step stays marked so you can see where it stopped." };
  }
  if (intent.kind === "deposit") {
    return { title: "Adding to the vault", body: "Each hop has to land before the next. A failed step stays marked so you can see where it stopped." };
  }
  return { title: "Sending", body: "Follow each hop. A failed step stays marked so you can see where it stopped." };
}

export function leftoverSteps(intent: Intent, seen: ReadonlySet<string>): Omit<SignStep, "status">[] {
  const rows: Omit<SignStep, "status">[] = [];
  const product = intent.kind === "stream" || intent.kind === "saving" || intent.kind === "lock" || intent.kind === "deposit";
  if (product && !seen.has("vault")) {
    rows.push({ id: "vault", title: "Vault ready", detail: "Created once for this account." });
  }
  if (product && intent.network === "celo" && !seen.has("fee")) {
    rows.push({ id: "fee", title: "Celo network fee", detail: "Skipped when this passkey already holds CELO." });
  }
  const pay = "pay" in intent ? intent.pay : undefined;
  if (product && (pay === "usdt" || pay === "eth") && !seen.has("swap")) {
    rows.push({ id: "swap", title: "Swap into dollars", detail: "Uniswap turns the token you picked into USDm." });
  }
  if (product && !seen.has("deposit") && !seen.has("wrap")) {
    rows.push({ id: "deposit", title: "Put dollars in the vault", detail: "The stream spends from this deposit." });
  }
  if ((intent.kind === "stream" || intent.kind === "saving") && !seen.has("open")) {
    rows.push({ id: "open", title: "Open the stream", detail: "Money starts moving every second." });
  }
  if (intent.kind === "lock" && !seen.has("open")) {
    rows.push({ id: "open", title: "Create the lock", detail: "Funds stay until the unlock date." });
  }
  if (!seen.has("confirm")) {
    rows.push({ id: "confirm", title: "Confirmed on chain", detail: "Wait for the receipt." });
  }
  return rows;
}

export function withStatus(rows: Omit<SignStep, "status">[], status: StepStatus): SignStep[] {
  return rows.map((row) => ({ ...row, status }));
}

export function bundlerLine(chainId?: number, origin = ""): Omit<SignStep, "status"> | null {
  if (chainId !== 42220) return null;
  const host = origin.replace(/\/$/, "") || "https://www.rvess.xyz";
  return { id: "bundler", title: "Send through the Celo bundler", detail: `${host}/api/bundler/celo` };
}
