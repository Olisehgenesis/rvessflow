export const HOUR = 60 * 60;
export const DAY = 24 * HOUR;
export const MIN_CYCLE = HOUR;
export const MAX_CYCLE = 366 * DAY;

export const cycleChoices = ["hour", "week", "month", "year", "custom"] as const;
export type CycleChoice = (typeof cycleChoices)[number];

export type CyclePlan = {
  cycle: number;
  window: number;
  grace: number;
};

export function isCycleChoice(value: string): value is CycleChoice {
  return (cycleChoices as readonly string[]).includes(value);
}

export function cyclePlan(choice: string, customDays: number): CyclePlan | null {
  if (!isCycleChoice(choice)) return null;
  const cycle =
    choice === "hour"
      ? HOUR
      : choice === "week"
        ? 7 * DAY
        : choice === "month"
          ? 30 * DAY
          : choice === "year"
            ? 365 * DAY
            : customCycle(customDays);
  if (cycle === null || cycle < MIN_CYCLE || cycle > MAX_CYCLE) return null;
  const timing = windows(choice, cycle);
  if (timing.window <= 0 || timing.window + timing.grace > cycle) return null;
  return { cycle, ...timing };
}

function customCycle(days: number): number | null {
  if (!Number.isInteger(days) || days < 1 || days > 366) return null;
  return days * DAY;
}

function windows(choice: CycleChoice, cycle: number): { window: number; grace: number } {
  if (choice === "hour") return { window: 20 * 60, grace: 10 * 60 };
  if (choice === "week") return { window: 2 * DAY, grace: DAY };
  if (choice === "month") return { window: 7 * DAY, grace: 2 * DAY };
  if (choice === "year") return { window: 30 * DAY, grace: 7 * DAY };
  const window = Math.floor(cycle / 4);
  const grace = Math.floor(cycle / 8);
  return { window, grace };
}

export function spanLabel(seconds: number): string {
  const days = Math.floor(seconds / DAY);
  const hours = Math.floor((seconds % DAY) / HOUR);
  const minutes = Math.floor((seconds % HOUR) / 60);
  const parts: string[] = [];
  if (days) parts.push(days === 1 ? "1 day" : `${days} days`);
  if (hours) parts.push(hours === 1 ? "1 hour" : `${hours} hours`);
  if (minutes) parts.push(minutes === 1 ? "1 minute" : `${minutes} minutes`);
  return parts.join(", ") || "0 minutes";
}
