import type { Address, Hex } from "viem";

/** VaultFactory.createVault() */
export const createVaultSelector = "0x5d12928b";
/** VaultFactory.VaultExists() */
export const vaultExistsSelector = "0x4239717c";

export function isCreateVaultOnly(calls: readonly { to: Address; data: Hex }[]) {
  if (calls.length !== 1) return false;
  const call = calls[0];
  return Boolean(call && call.data.toLowerCase().startsWith(createVaultSelector));
}

export function vaultAlreadyExists(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes(vaultExistsSelector);
}
