import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeFunctionData, zeroAddress } from "viem";
import { concatHex, toHex } from "viem";
import { GOOD_DOLLAR } from "@/lib/stables";
import {
  GDX_BROKER,
  GDX_EXCHANGE_ID,
  GDX_USDM,
  exitContributionPct,
  gdxBrokerAbi,
  gdxPair,
  gdxUsd8FromPrice,
  minGdxOut,
} from "@/lib/gdx-reserve";
import { gdxViaFromKey, gdxViaSend, isGdxVia } from "@/lib/gdx-route";
import { canSwapToken, sendAssetForKey } from "@/lib/token-face";
import { describeCalls } from "@/lib/sign-steps";
import { shouldSponsorCeloUserOp } from "@/lib/celo-sponsor";

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

describe("G$ Reserve", () => {
  it("prices currentPrice 18-decimal USDm as 8-decimal USD", () => {
    assert.equal(gdxUsd8FromPrice(127381883170418n), 12738n);
    assert.equal(gdxUsd8FromPrice(0n), 0n);
  });

  it("keeps a 0.50% floor under the quoted out amount", () => {
    assert.equal(minGdxOut(10_000n), 9950n);
  });

  it("discloses a 10% exit contribution on sells", () => {
    assert.equal(exitContributionPct(), 10);
  });

  it("buys G$ with USDm and sells G$ for USDm", () => {
    const buy = gdxPair("buy");
    const sell = gdxPair("sell");
    assert.equal(buy.tokenIn, GDX_USDM);
    assert.equal(buy.tokenOut, GOOD_DOLLAR);
    assert.equal(sell.tokenIn, GOOD_DOLLAR);
    assert.equal(sell.tokenOut, GDX_USDM);
  });

  it("maps Uniswap hops through USDm without an SDK", () => {
    assert.equal(isGdxVia("usdc"), true);
    assert.equal(gdxViaSend("usdt"), "celo-usdt");
    assert.equal(gdxViaFromKey("celo-usdc"), "usdc");
    assert.equal(sendAssetForKey("celo-gooddollar"), "celo-gdx");
    assert.equal(canSwapToken({ key: "celo-usdt", label: "USDT", network: "Celo", amount: "0", usd: "0" }), true);
  });

  it("encodes swapIn for the Celo broker", () => {
    const data = encodeFunctionData({
      abi: gdxBrokerAbi,
      functionName: "swapIn",
      args: [zeroAddress, GDX_EXCHANGE_ID, GDX_USDM, GOOD_DOLLAR, 1n, 1n],
    });
    assert.equal(data.startsWith("0xddbbe850"), true);
    const rows = describeCalls([{ to: GDX_BROKER, data, value: "0" }]);
    assert.equal(rows[0]?.id, "gdx");
  });

  it("sponsors the Reserve broker on Celo", () => {
    const callData = encodeFunctionData({
      abi: executeAbi,
      functionName: "execute",
      args: ["0x".padEnd(66, "0") as `0x${string}`, concatHex([GDX_BROKER, toHex(0n, { size: 32 }), "0x"])],
    });
    assert.equal(shouldSponsorCeloUserOp({ chainId: 42220, callData }), true);
  });
});
