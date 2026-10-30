import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatGdx, fromWire, sumStats, toWire, type ChainStats } from "@/lib/protocol-stats-view";

const empty = (name: string, gdx: bigint): ChainStats => ({
  name,
  explorer: "",
  factory: "0x0000000000000000000000000000000000000001",
  locks: "0x0000000000000000000000000000000000000002",
  groups: "0x0000000000000000000000000000000000000003",
  vaults: 1,
  groupsCreated: 2,
  groupsStarted: 1,
  locksOpened: 3,
  txs: 4,
  users: 5,
  gdx,
});

describe("protocol stats", () => {
  it("adds Celo and Base counts", () => {
    const total = sumStats([empty("Celo", 10n ** 18n), empty("Base", 0n)]);
    assert.equal(total.vaults, 2);
    assert.equal(total.groupsCreated, 4);
    assert.equal(total.gdx, 10n ** 18n);
  });

  it("prints whole G$", () => {
    assert.equal(formatGdx(0n), "0");
    assert.equal(formatGdx(44_000_000n * 10n ** 18n), "44,000,000");
  });

  it("round-trips JSON wire format", () => {
    const chains = [empty("Celo", 10n ** 18n)];
    const wire = toWire({ at: 1, chains, ...sumStats(chains) });
    assert.equal(wire.gdx, (10n ** 18n).toString());
    assert.equal(fromWire(wire).gdx, 10n ** 18n);
  });
});
