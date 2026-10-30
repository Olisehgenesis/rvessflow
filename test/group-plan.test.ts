import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DAY } from "@/lib/cycle";
import { liveRotationPlan, rotationPlan, weiTimes } from "@/lib/group-plan";

describe("group rotation plan", () => {
  it("shows what you post and what each turn receives", () => {
    const plan = rotationPlan({
      contribution: "1",
      token: "usd",
      cycles: 1,
      cycleSeconds: 7 * DAY,
      members: [
        { name: "Ada", you: true },
        { name: "Bae" },
        { name: "Cam" },
      ],
    });
    assert.equal(plan.youPost, "1 USD");
    assert.equal(plan.othersCount, 2);
    assert.equal(plan.othersPost, "1 USD");
    assert.equal(plan.eachTurn, "3 USD");
    assert.equal(plan.turns[0]?.name, "Ada (you)");
    assert.equal(plan.turns[0]?.when, "When the rotation starts");
    assert.equal(plan.turns[0]?.receives, "3 USD");
  });

  it("spaces later turns by the cycle length", () => {
    const plan = rotationPlan({
      contribution: "20",
      token: "usd",
      cycles: 3,
      cycleSeconds: 7 * DAY,
      members: [{ name: "Ada", you: true }, { name: "Bae" }, { name: "Cam" }],
    });
    assert.equal(plan.youPost, "60 USD");
    assert.equal(plan.eachTurn, "60 USD");
    assert.equal(plan.turns[1]?.name, "Bae");
    assert.equal(plan.turns[1]?.when, "After 7 days");
    assert.equal(plan.turns[2]?.when, "After 14 days");
  });

  it("formats live wei amounts", () => {
    const wei = "1000000000000000000";
    assert.equal(weiTimes(wei, 3), "3000000000000000000");
    const plan = liveRotationPlan({
      contributionWei: wei,
      token: "usd",
      cycles: 1,
      cycleSeconds: 7 * DAY,
      members: [{ name: "Ada", you: true }, { name: "Bae" }, { name: "Cam" }],
    });
    assert.equal(plan.youPost, "1.00 USD");
    assert.equal(plan.eachTurn, "3.00 USD");
  });
});
