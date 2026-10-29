import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeFunctionData, concatHex, toHex } from "viem";
import { prepareCeloBundlerBody, shouldSponsorCeloUserOp, withCeloSponsorshipPolicy } from "@/lib/celo-sponsor";

const executeAbi = [
  {
    type: "function",
    name: "execute",
    inputs: [
      { name: "execMode", type: "bytes32" },
      { name: "executionCalldata", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
] as const;

const router = "0x5615CDAb10dc425a742d643d949a7F474C01abc4";
const factory = "0xeC9f5717593f66BA703e9bdB871B24014642F3cB";

function executeCall(to: `0x${string}`) {
  return encodeFunctionData({
    abi: executeAbi,
    functionName: "execute",
    args: ["0x".padEnd(66, "0") as `0x${string}`, concatHex([to, toHex(0n, { size: 32 }), "0x"])],
  });
}

describe("Celo sponsorship policy", () => {
  it("sponsors Uniswap and the vault factory on Celo", () => {
    assert.equal(shouldSponsorCeloUserOp({ chainId: 42220, callData: executeCall(router) }), true);
    assert.equal(shouldSponsorCeloUserOp({ chainId: 42220, callData: executeCall(factory) }), true);
  });

  it("rejects another chain or an unknown contract", () => {
    assert.equal(shouldSponsorCeloUserOp({ chainId: 8453, callData: executeCall(router) }), false);
    assert.equal(
      shouldSponsorCeloUserOp({ chainId: 42220, callData: executeCall("0x1111111111111111111111111111111111111111") }),
      false,
    );
  });

  it("does not attach a Pimlico policy id", () => {
    const next = withCeloSponsorshipPolicy({
      jsonrpc: "2.0",
      id: 1,
      method: "pm_sponsorUserOperation",
      params: [{}, "0x0000000071727De22E5E9d8BAf0edAc6f37da032", { sponsorshipPolicyId: "sp_small_tusk" }],
    }) as { params: [unknown, unknown, Record<string, unknown>] };
    assert.equal("sponsorshipPolicyId" in next.params[2], false);
  });

  it("keeps ERC-7677 chain id and strips leftover policy ids", () => {
    const next = withCeloSponsorshipPolicy({
      jsonrpc: "2.0",
      id: 1,
      method: "pm_getPaymasterStubData",
      params: [{}, "0x0000000071727De22E5E9d8BAf0edAc6f37da032", "0xa4ec", { foo: 1, sponsorshipPolicyId: "sp_small_tusk" }],
    }) as { params: [unknown, unknown, string, { foo: number; sponsorshipPolicyId?: string }] };
    assert.equal(next.params[2], "0xa4ec");
    assert.equal(next.params[3].foo, 1);
    assert.equal("sponsorshipPolicyId" in next.params[3], false);
  });

  it("drops null UserOp fields Alto rejects", () => {
    const next = prepareCeloBundlerBody({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_estimateUserOperationGas",
      params: [{ sender: "0x1", factory: null, paymaster: null }, "0x0000000071727De22E5E9d8BAf0edAc6f37da032", null],
    }) as { params: [{ sender: string; factory?: string }, string] };
    assert.equal(next.params[0].sender, "0x1");
    assert.equal("factory" in next.params[0], false);
    assert.equal(next.params.length, 2);
  });
});
