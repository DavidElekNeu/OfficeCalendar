import {
  addDays,
  eachDayOfInterval,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  getDay,
  isSameMonth,
  isWeekend,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { CalendarInput, EligibleDay } from "./types";

export const dateKey = (date: Date) => format(date, "yyyy-MM-dd");

export const monthKey = (date: Date) => format(date, "yyyy-MM");

export const getCalendarRowStart = (date: Date) => startOfWeek(date, { weekStartsOn: 1 });

export function getWeekIndexInMonth(date: Date): number {
  const monthStart = startOfMonth(date);
  const firstRowStart = getCalendarRowStart(monthStart);
  return Math.floor(differenceInCalendarDays(date, firstRowStart) / 7) + 1;
}

export function getEligibleWorkingDays(input: CalendarInput): EligibleDay[] {
  const monthStart = startOfMonth(input.month);
  const monthEnd = endOfMonth(monthStart);
  const excluded = new Set([
    ...(input.publicHolidays ?? []),
    ...(input.vacation ?? []),
  ]);

  return (input.includeAdjacentDays ? getMonthCalendarDays(input.month) : eachDayOfInterval({ start: monthStart, end: monthEnd }))
    .filter((day) => !isWeekend(day) && !excluded.has(dateKey(day)))
    .map((date) => ({
      date,
      dateKey: dateKey(date),
      weekday: getDay(date),
      weekKey: dateKey(getCalendarRowStart(date)),
      weekIndex: getWeekIndexInMonth(date),
    }));
}

export function getMonthCalendarDays(month: Date): Date[] {
  const first = startOfMonth(month);
  const start = startOfWeek(getDay(first) === 1 ? addDays(first, -3) : first, { weekStartsOn: 1 });
  const last = endOfMonth(month);
  const end = endOfWeek([5, 6, 0].includes(getDay(last)) ? addDays(last, 3) : last, { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end });
}

export function isDateInSelectedMonth(date: Date, month: Date) {
  return isSameMonth(date, month);
}

export function getNextWeekday(date: Date, weekday: number) {
  const current = getDay(date);
  return addDays(date, (weekday - current + 7) % 7);
}
