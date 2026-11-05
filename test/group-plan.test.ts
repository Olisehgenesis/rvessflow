import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DAY } from "@/lib/cycle";
import { liveRotationPlan, receiveAt, rotationLengthLabel, rotationPlan, runDuration, turnHeading, turnMoneyLine, turnTimes, turnsInRounds, weiTimes } from "@/lib/group-plan";

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
    assert.equal(plan.turns[0]?.round, 0);
    assert.equal(plan.turns[0]?.name, "Ada (you)");
    assert.equal(plan.turns[0]?.when, "When the rotation starts");
    assert.equal(plan.turns[0]?.receives, "3 USD");
  });

  it("turns one round into one turn for each person", () => {
    const members = [{ name: "Ada", you: true }, { name: "Bae" }, { name: "Cam" }];
    assert.equal(turnsInRounds(1, 3), 3);
    assert.equal(turnsInRounds(2, 3), 6);
    const plan = rotationPlan({
      contribution: "1",
      token: "usd",
      cycles: turnsInRounds(1, members.length),
      cycleSeconds: 7 * DAY,
      members,
    });
    assert.equal(plan.youPost, "3 USD");
    assert.equal(plan.turns.map((turn) => turn.name).join(", "), "Ada (you), Bae, Cam");
    assert.equal(plan.turns[0]?.round, 1);
    assert.equal(plan.turns[2]?.round, 1);
    assert.equal(plan.turns[2]?.when, "After 14 days");
    assert.equal(runDuration(1, 3, 7 * DAY), "21 days");
    const start = 1_793_806_313;
    const dated = rotationPlan({
      contribution: "1",
      token: "usd",
      cycles: 3,
      cycleSeconds: 7 * DAY,
      startsAt: start,
      members,
    });
    assert.equal(dated.turns[0]?.at, receiveAt(start, 0, 7 * DAY));
    assert.equal(dated.turns[2]?.at, start + 14 * DAY);
    assert.equal(turnHeading(0, 3, 3), "Turn 1 of 3 · Round 1 of 1");
    assert.equal(rotationLengthLabel(3, 3), "1 round · 3 turns, one for each person");
    assert.equal(rotationLengthLabel(1, 3), "1 turn · one person receives the pot");
    assert.throws(() => turnsInRounds(200, 3));
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

  it("says who has paid this turn and who receives the pot", () => {
    assert.equal(
      turnMoneyLine({ each: "1.00 USD", pot: "3.00 USD", recipient: "Ada (you)", paid: 1, members: 3 }),
      "Each person pays 1.00 USD this turn. 1 of 3 has paid. The 3.00 USD goes to Ada (you).",
    );
  });

  it("reads the payment window from the group start", () => {
    const start = 1_793_806_313;
    const times = turnTimes({
      startTime: start,
      cycle: 0,
      cycles: 1,
      cycleSeconds: 7 * DAY,
      windowSeconds: 2 * DAY,
      graceSeconds: DAY,
      offset: 0,
    });
    assert.equal(times.onTimeEnd, start + 2 * DAY);
    assert.equal(times.payUntil, start + 3 * DAY);
    assert.equal(times.turnEnds, start + 7 * DAY);
    assert.equal(times.nextOpens, 0);
  });
});
