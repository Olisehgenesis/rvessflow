import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createVaultSelector } from "@/lib/vault-create";
import { celoGasTreasury } from "@/lib/celo-fee";
import { celoMarket } from "@/lib/celo-market";
import { bundlerLine, describeCalls, humanTrack, leftoverSteps } from "@/lib/sign-steps";
import type { Intent } from "@/lib/intent";

const stream: Intent = {
  kind: "stream",
  name: "flow#1",
  amount: "1",
  duration: 86400,
  flowKind: "flow",
  recipient: "0x0000000000000000000000000000000000000001",
  startAt: 0,
  description: "",
  frequency: "Monthly",
  startedAt: 1,
  pay: "usdt",
  network: "celo",
  ref: "r",
};

describe("sign steps", () => {
  it("labels vault, fee skim, swap, and createFlow", () => {
    const rows = describeCalls([
      { to: "0x0060f57E447e5E2D310b61cAD372Ae83959aF3B7", data: `${createVaultSelector}`, value: "0" },
      {
        to: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
        data: `0xa9059cbb${celoGasTreasury.slice(2).toLowerCase().padStart(64, "0")}${"1".padStart(64, "0")}`,
        value: "0",
      },
      { to: celoMarket.swapRouter02, data: "0x5ae401dc", value: "0" },
      { to: "0x0A55056218036f3396b00115e44569eb7D33e951", data: "0xd7e05f44", value: "0" },
    ]);
    assert.deepEqual(
      rows.map((row) => row.id),
      ["vault", "fee", "swap", "open"],
    );
  });

  it("keeps later hops visible after the vault exists", () => {
    const rest = leftoverSteps(stream, new Set(["vault"]));
    assert.ok(rest.some((row) => row.id === "swap"));
    assert.ok(rest.some((row) => row.id === "open"));
  });

  it("points at the Celo bundler", () => {
    const row = bundlerLine(42220, "https://www.rvess.xyz");
    assert.equal(row?.detail, "https://www.rvess.xyz/api/bundler/celo");
  });

  it("shows four short human steps", () => {
    const rows = humanTrack("sign");
    assert.deepEqual(
      rows.map((row) => row.title),
      ["Creating", "Sign", "Sending", "Done"],
    );
    assert.equal(rows[0].status, "done");
    assert.equal(rows[1].status, "run");
  });
});
