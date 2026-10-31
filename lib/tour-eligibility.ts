export const TOUR_VERSION = 1;

export type TourStatus = "pending" | "complete" | "skipped";
export type TourSource = "auto" | "skip" | "finish" | "grandfather" | "restart" | "tester";

export type TourRow = {
  status: TourStatus;
  step: number;
  version: number;
};

export type TourDecision = {
  eligible: boolean;
  step: number;
  write?: { status: TourStatus; step: number; source: TourSource };
};

export function decideTour(input: {
  method: "passkey" | "wallet" | "tester";
  needsName: boolean;
  termsAccepted: boolean;
  hasStarted: boolean;
  row: TourRow | null;
}): TourDecision {
  if (!input.termsAccepted || input.needsName) return { eligible: false, step: 0 };
  if (input.row?.status === "complete" || input.row?.status === "skipped") {
    return { eligible: false, step: 0 };
  }
  if (input.row?.status === "pending") {
    return { eligible: true, step: Math.max(0, input.row.step) };
  }
  if (input.method === "tester") {
    return { eligible: false, step: 0, write: { status: "complete", step: 0, source: "tester" } };
  }
  if (input.hasStarted) {
    return { eligible: false, step: 0, write: { status: "complete", step: 0, source: "grandfather" } };
  }
  return { eligible: true, step: 0, write: { status: "pending", step: 0, source: "auto" } };
}
