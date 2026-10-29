import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeFunctionData, concatHex, toHex } from "viem";
import { shouldSponsorCeloUserOp, withCeloSponsorshipPolicy } from "@/lib/celo-sponsor";

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

  it("attaches the policy id to paymaster RPCs", () => {
    const next = withCeloSponsorshipPolicy({
      jsonrpc: "2.0",
      id: 1,
      method: "pm_sponsorUserOperation",
      params: [{}, "0x0000000071727De22E5E9d8BAf0edAc6f37da032"],
    }) as { params: [unknown, unknown, { sponsorshipPolicyId: string }] };
    assert.equal(next.params[2].sponsorshipPolicyId, "sp_small_tusk");
  });
});
