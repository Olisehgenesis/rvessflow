import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toFunctionSelector } from "viem";
import { createVaultSelector, isCreateVaultOnly, vaultAlreadyExists, vaultExistsSelector } from "@/lib/vault-create";

describe("vault create", () => {
  it("matches the factory selectors", () => {
    assert.equal(createVaultSelector, toFunctionSelector("createVault()"));
    assert.equal(vaultExistsSelector, toFunctionSelector("VaultExists()"));
  });

  it("treats a lone createVault call as the vault step", () => {
    assert.equal(
      isCreateVaultOnly([{ to: "0xeC9f5717593f66BA703e9bdB871B24014642F3cB", data: `${createVaultSelector}` }]),
      true,
    );
    assert.equal(
      isCreateVaultOnly([
        { to: "0xeC9f5717593f66BA703e9bdB871B24014642F3cB", data: `${createVaultSelector}` },
        { to: "0xeC9f5717593f66BA703e9bdB871B24014642F3cB", data: `${createVaultSelector}` },
      ]),
      false,
    );
  });

  it("detects VaultExists from a bundler revert", () => {
    assert.equal(
      vaultAlreadyExists(new Error(`Execution reverted with reason: UserOperation reverted during simulation with reason: ${vaultExistsSelector}.`)),
      true,
    );
  });
});
