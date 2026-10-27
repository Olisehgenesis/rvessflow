import type { Address, Hash, Hex } from "viem";

type Call = { to: Address; data: Hex; value?: string };

export function walletSendCallsParam(from: Address, chainId: number, calls: Call[]) {
  return {
    version: "2.0.0" as const,
    from,
    chainId: `0x${chainId.toString(16)}`,
    atomicRequired: true,
    calls: calls.map((call) => ({
      to: call.to,
      data: call.data,
      value: hexValue(call.value),
    })),
  };
}

function hexValue(value: string | undefined): Hex {
  if (!value || value === "0") return "0x0";
  return `0x${BigInt(value).toString(16)}`;
}

export function batchId(result: unknown): string | null {
  if (typeof result === "string" && result.length > 0) return result;
  if (!result || typeof result !== "object") return null;
  const record = result as { id?: unknown; batchId?: unknown };
  if (typeof record.id === "string" && record.id.length > 0) return record.id;
  if (typeof record.batchId === "string" && record.batchId.length > 0) return record.batchId;
  return null;
}

export function batchOutcome(status: unknown): { hash?: Hash; error?: string; pending: boolean } {
  if (!status || typeof status !== "object") return { pending: true };
  const record = status as { status?: unknown; receipts?: unknown };
  const code = typeof record.status === "number" ? record.status : Number(record.status);
  if (!Number.isFinite(code)) return { pending: true };
  if (code >= 100 && code < 200) return { pending: true };
  const receipts = Array.isArray(record.receipts) ? record.receipts : [];
  const last = receipts.at(-1) as { transactionHash?: unknown; status?: unknown } | undefined;
  const hash = typeof last?.transactionHash === "string" ? (last.transactionHash as Hash) : undefined;
  if (code >= 200 && code < 300) {
    if (last?.status === "0x0") return { error: "The transaction reverted.", pending: false };
    if (!hash) return { pending: true };
    return { hash, pending: false };
  }
  if (code >= 400) {
    return { error: code >= 500 ? "The transaction reverted." : "The wallet could not send that transaction.", pending: false };
  }
  return { pending: true };
}

export function batchUnsupported(error: unknown): boolean {
  const code = typeof error === "object" && error && "code" in error ? Number(error.code) : NaN;
  if (code === 4001 || code === 5700 || code === 5720 || code === 5740) return false;
  if (code === -32601 || code === 4200) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /method not found|does not exist|not supported|unsupported method/i.test(message);
}
