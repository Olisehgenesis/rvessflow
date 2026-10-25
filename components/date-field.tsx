"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

const MAX_SECONDS = 30 * 365 * 86400;

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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

function monthCells(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const pad = (first.getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const cells: Date[] = [];
  for (let i = 0; i < pad; i++) cells.push(new Date(year, month, 1 - (pad - i)));
  for (let day = 1; day <= count; day++) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    cells.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
  }
  return cells;
}

export function DateField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  hint?: string;
  value: Date;
  onChange: (next: Date) => void;
  min: Date;
  max: Date;
}) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const today = startOfDay(new Date());
  const cells = monthCells(shown.getFullYear(), shown.getMonth());
  const title = `${LONG_MONTHS[shown.getMonth()]} ${shown.getFullYear()}`;
  const earliest = new Date(min.getFullYear(), min.getMonth(), 1);
  const latest = new Date(max.getFullYear(), max.getMonth(), 1);
  const isToday = sameDay(value, today);
  const summary = isToday ? `Today · ${formatDay(value)}` : formatDay(value);

  function shift(by: number) {
    const next = new Date(shown.getFullYear(), shown.getMonth() + by, 1);
    if (next < earliest || next > latest) return;
    setShown(next);
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => {
          setShown(new Date(value.getFullYear(), value.getMonth(), 1));
          setOpen(true);
        }}
        className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left"
      >
        <span>
          <span className="block text-xs text-muted-foreground">{label}</span>
          <span className="mt-0.5 block text-sm font-medium tabular-nums">{summary}</span>
        </span>
        <span aria-hidden className="text-muted-foreground">›</span>
      </button>
      {hint ? <p className="px-1 text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
      {open && typeof document !== "undefined"
        ? createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className="w-full max-w-lg rounded-t-3xl bg-white px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
          <div className="mb-3 flex items-start justify-between">
            <div>
              <p className="text-base font-medium">{label}</p>
              <p className="text-sm text-muted-foreground">{summary}</p>
            </div>
            <button type="button" className="grid size-9 place-items-center text-lg" aria-label="Close" onClick={() => setOpen(false)}>×</button>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{title}</p>
            <div className="flex gap-1">
              <button type="button" className="grid size-9 place-items-center rounded-full" aria-label="Previous month" onClick={() => shift(-1)}>‹</button>
              <button type="button" className="grid size-9 place-items-center rounded-full" aria-label="Next month" onClick={() => shift(1)}>›</button>
            </div>
          </div>
          <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1 pb-2">
            {cells.map((day) => {
              const outside = day.getMonth() !== shown.getMonth();
              const disabled = startOfDay(day) < startOfDay(min) || startOfDay(day) > startOfDay(max);
              const selected = sameDay(day, value);
              const todayCell = sameDay(day, today);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  aria-label={formatDay(day)}
                  onClick={() => {
                    onChange(startOfDay(day));
                    setOpen(false);
                  }}
                  className={`mx-auto grid size-9 place-items-center rounded-full text-sm tabular-nums ${
                    selected ? "bg-primary font-semibold text-primary-foreground" : todayCell ? "ring-1 ring-foreground" : outside ? "text-muted-foreground/40" : "text-foreground"
                  } disabled:opacity-30`}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
