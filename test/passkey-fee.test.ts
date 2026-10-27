import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimationSkipped, passkeyPaysWith, userOpCost } from "@/lib/passkey-fee";

describe("passkey network fee", () => {
  it("uses USDC even when the account also has enough ETH", () => {
    assert.equal(passkeyPaysWith({ ethBalance: 50n, ethCost: 40n, usdcBalance: 1_000_000n }), "usdc");
    assert.equal(passkeyPaysWith({ ethBalance: 0n, ethCost: null, usdcBalance: 1_000_000n }), "usdc");
  });

  it("uses ETH only when USDC is not enough for the fee", () => {
    assert.equal(passkeyPaysWith({ ethBalance: 50n, ethCost: 40n, usdcBalance: 1n }), "eth");
  });

  it("explains that a saving balance cannot pay the fee", () => {
    assert.throws(
      () => passkeyPaysWith({ ethBalance: 0n, ethCost: null, usdcBalance: 0n }),
      /USDC kept inside a saving/,
    );
  });

  it("prices the user operation from every gas field", () => {
    assert.equal(
      userOpCost({
        callGasLimit: 100n,
        verificationGasLimit: 50n,
        preVerificationGas: 25n,
        paymasterVerificationGasLimit: 20n,
        paymasterPostOpGasLimit: 5n,
        maxFeePerGas: 2n,
      }),
      480n,
    );
  });

  it("recognises a bundler that rejected an unpaid prefund", () => {
    assert.equal(estimationSkipped(new Error("AA21 didn't pay prefund")), true);
    assert.equal(estimationSkipped(new Error("The signature was dismissed.")), false);
  });
});
