import assert from "node:assert/strict";
import test from "node:test";
import { batchId, batchOutcome, batchUnsupported, walletSendCallsParam } from "@/lib/wallet-batch";

const from = "0x00000000000000000000000000000000000000a1";
const to = "0x00000000000000000000000000000000000000b2";

test("a stream paid in ETH becomes one atomic wallet batch", () => {
  const param = walletSendCallsParam(from, 8453, [
    { to, data: "0xabcdef", value: "1000" },
    { to, data: "0x1234", value: "0" },
  ]);
  assert.equal(param.version, "2.0.0");
  assert.equal(param.chainId, "0x2105");
  assert.equal(param.atomicRequired, true);
  assert.equal(param.calls.length, 2);
  assert.equal(param.calls[0].value, "0x3e8");
  assert.equal(param.calls[1].value, "0x0");
});

test("batch ids from Base Account and from a plain string both count", () => {
  assert.equal(batchId("0xabc"), "0xabc");
  assert.equal(batchId({ id: "0x1" }), "0x1");
  assert.equal(batchId({ batchId: "0x2" }), "0x2");
  assert.equal(batchId({}), null);
});

test("a confirmed batch returns its receipt, and a revert does not", () => {
  const hash = "0x" + "ab".repeat(32);
  assert.deepEqual(batchOutcome({ status: 200, receipts: [{ transactionHash: hash, status: "0x1" }] }), { hash, pending: false });
  assert.equal(batchOutcome({ status: 100 }).pending, true);
  assert.equal(batchOutcome({ status: 500 }).error, "The transaction reverted.");
});

test("a missing batch method can fall back, a dismissed signature cannot", () => {
  assert.equal(batchUnsupported({ code: -32601, message: "method not found" }), true);
  assert.equal(batchUnsupported({ code: 4001, message: "User rejected" }), false);
  assert.equal(batchUnsupported(new Error("The account does not have enough")), false);
});
