"use client";

import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const MAX_SECONDS = 30 * 365 * 86400;

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDay(date: Date): string {
  return `${date.getDate()} ${SHORT_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function secondsUntilEnd(end: Date, from = new Date()): number {
  const close = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59);
  return Math.floor(close.getTime() / 1000) - Math.floor(from.getTime() / 1000);
}

export function streamWindow(start: Date, end: Date, now = new Date()): { startAt: number; duration: number } {
  const startDay = startOfDay(start);
  const today = startOfDay(now);
  const startAt = startDay.getTime() <= today.getTime() ? 0 : Math.floor(startDay.getTime() / 1000);
  const origin = startAt === 0 ? now : startDay;
  return { startAt, duration: secondsUntilEnd(end, origin) };
}

export function spanText(start: Date, end: Date): string {
  const days = Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / 86400000);
  if (days <= 0) return "Same day";
  if (days % 30 === 0) {
    const months = days / 30;
    return `${months} month${months === 1 ? "" : "s"}`;
  }
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function dateProblem(duration: number, minSeconds: number): string | null {
  if (!Number.isInteger(duration) || duration < minSeconds) {
    return minSeconds >= 3600 ? "Pick a day at least an hour from now." : "Pick a later day. The contract needs at least a minute.";
  }
  if (duration > MAX_SECONDS) return "That date is more than 30 years away.";
  return null;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function DateField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  presentation = "plain",
  summary: summaryOverride,
}: {
  label: string;
  hint?: string;
  value: Date;
  onChange: (next: Date) => void;
  min: Date;
  max: Date;
  presentation?: "plain" | "ends" | "unlock";
  summary?: string;
}) {
  const today = startOfDay(new Date());
  const isToday = sameDay(value, today);
  const summary =
    summaryOverride ??
    (presentation === "ends"
      ? `Ends · ${formatDay(value)}`
      : presentation === "unlock"
        ? formatDay(value)
        : isToday
          ? `Today · ${formatDay(value)}`
          : formatDay(value));

  return (
    <div className="space-y-1.5">
      <Popover>
        <PopoverTrigger
          type="button"
          className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left"
        >
          <span className="flex items-center gap-3">
            <CalendarIcon className="size-4 text-muted-foreground" />
            <span>
              <span className="block text-xs text-muted-foreground">{label}</span>
              <span className="mt-0.5 block text-sm font-medium tabular-nums">{summary}</span>
            </span>
          </span>
          <span aria-hidden className="text-muted-foreground">›</span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-2">
          <Calendar
            mode="single"
            selected={value}
            defaultMonth={value}
            onSelect={(next) => {
              if (next) onChange(startOfDay(next));
            }}
            disabled={{ before: startOfDay(min), after: startOfDay(max) }}
          />
        </PopoverContent>
      </Popover>
      {hint ? <p className="px-1 text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
