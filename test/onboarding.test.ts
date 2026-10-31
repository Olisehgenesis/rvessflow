import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideTour } from "@/lib/tour-eligibility";
import { tourSteps } from "@/lib/tour-steps";

const base = {
  method: "passkey" as const,
  needsName: false,
  termsAccepted: true,
  hasStarted: false,
  row: null,
};

describe("onboarding eligibility", () => {
  it("shows the tour to a brand-new passkey with an empty account", () => {
    const next = decideTour(base);
    assert.equal(next.eligible, true);
    assert.equal(next.step, 0);
    assert.equal(next.write?.status, "pending");
    assert.equal(next.write?.source, "auto");
  });

  it("grandfathers an account that already has a goal, lock, group, or balance", () => {
    const next = decideTour({ ...base, hasStarted: true });
    assert.equal(next.eligible, false);
    assert.equal(next.write?.source, "grandfather");
    assert.equal(next.write?.status, "complete");
  });

  it("does not auto-start testers", () => {
    const next = decideTour({ ...base, method: "tester" });
    assert.equal(next.eligible, false);
    assert.equal(next.write?.source, "tester");
  });

  it("does not show the tour before terms or a wallet name", () => {
    assert.equal(decideTour({ ...base, termsAccepted: false }).eligible, false);
    assert.equal(decideTour({ ...base, needsName: true }).eligible, false);
  });

  it("does not show the tour again after skip or finish", () => {
    assert.equal(decideTour({ ...base, row: { status: "skipped", step: 2, version: 1 } }).eligible, false);
    assert.equal(decideTour({ ...base, row: { status: "complete", step: 0, version: 1 } }).eligible, false);
  });

  it("resumes a pending tour at the saved step", () => {
    const next = decideTour({ ...base, row: { status: "pending", step: 3, version: 1 } });
    assert.equal(next.eligible, true);
    assert.equal(next.step, 3);
    assert.equal(next.write, undefined);
  });
});

describe("onboarding steps", () => {
  it("keeps stream and lock on desktop and create on mobile", () => {
    const desk = tourSteps(true).map((step) => step.id);
    const phone = tourSteps(false).map((step) => step.id);
    assert.ok(desk.includes("stream"));
    assert.ok(desk.includes("lock"));
    assert.ok(!desk.includes("create"));
    assert.ok(phone.includes("create"));
    assert.ok(!phone.includes("stream"));
  });
});
