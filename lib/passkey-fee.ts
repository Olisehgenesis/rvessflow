import { usdcFeeReserve } from "@/lib/send-math";

export function usdcCanPayFee(usdcBalance: bigint): boolean {
  return usdcBalance > usdcFeeReserve;
}

/** USDC pays the fee when the account holds enough of it. ETH is only the fallback. */
export function passkeyPaysWith(input: { ethBalance: bigint; ethCost: bigint | null; usdcBalance: bigint }): "eth" | "usdc" {
  if (usdcCanPayFee(input.usdcBalance)) return "usdc";
  if (input.ethCost !== null && input.ethCost > 0n && input.ethBalance >= input.ethCost) return "eth";
  throw new Error("This passkey pays the network fee in USDC held at this address. Add USDC here, or a little ETH. USDC kept inside a saving stays there and does not pay it.");
}

/** Gas quote for an EntryPoint v0.7 user operation, with room above the quoted max fee. */
export function userOpCost(op: {
  callGasLimit?: bigint;
  verificationGasLimit?: bigint;
  preVerificationGas?: bigint;
  paymasterVerificationGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
  maxFeePerGas?: bigint;
}): bigint {
  const gas =
    (op.callGasLimit ?? 0n) +
    (op.verificationGasLimit ?? 0n) +
    (op.preVerificationGas ?? 0n) +
    (op.paymasterVerificationGasLimit ?? 0n) +
    (op.paymasterPostOpGasLimit ?? 0n);
  return (gas * (op.maxFeePerGas ?? 0n) * 120n) / 100n;
}

/** True when the bundler refused the operation because the account could not prefund it in ETH. */
export function estimationSkipped(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /AA21|prefund|insufficient funds|gas required exceeds allowance/i.test(message);
}
