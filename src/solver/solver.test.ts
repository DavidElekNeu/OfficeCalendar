import { describe, expect, it } from "vitest";
import { getEligibleWorkingDays } from "./calendar";
import { solveSchedule } from "./solver";
import type { Rule } from "./types";

type RuleInput = Rule extends infer Candidate ? Candidate extends { id: string; enabled: boolean } ? Omit<Candidate, "id" | "enabled"> : never : never;
const rule = (value: RuleInput, id = Math.random().toString(36)) => ({ id, enabled: true, ...value }) as Rule;
const month = (value: string) => new Date(`${value}-01T12:00:00`);
const officeDates = (result: ReturnType<typeof solveSchedule>) => result.schedules[0]?.days.filter((day) => day.status === "OFFICE").map((day) => day.dateKey) ?? [];

describe("hybrid office solver", () => {
  it("makes every Tuesday Office", () => {
    const result = solveSchedule({ month: month("2025-09"), rules: [rule({ type: "MANDATORY_WEEKDAY", weekday: 2, status: "OFFICE" }, "tuesday")] });
    expect(result.status).toBe("OPTIMAL");
    expect(officeDates(result)).toEqual(["2025-09-02", "2025-09-09", "2025-09-16", "2025-09-23", "2025-09-30"]);
  });

  it("supports the third Monday–Sunday calendar row", () => {
    const result = solveSchedule({ month: month("2025-09"), rules: [rule({ type: "NTH_WEEK_WEEKDAY", week: 3, weekday: 4, status: "OFFICE" }, "third-thursday")] });
    expect(officeDates(result)).toContain("2025-09-18");
    expect(officeDates(result)).not.toContain("2025-09-11");
  });

  it("allows Monday and Friday Home Office in the same calendar row", () => {
    const result = solveSchedule({ month: month("2026-09"), manualHomeOfficeDays: ["2026-09-07", "2026-09-11"], rules: [rule({ type: "NOT_BOTH_HOME_OFFICE", weekdays: [1, 5] }, "mon-fri")] });
    expect(result.status).toBe("OPTIMAL");
    expect(result.schedules[0].days.find((day) => day.dateKey === "2026-09-07")?.status).toBe("HOME_OFFICE");
    expect(result.schedules[0].days.find((day) => day.dateKey === "2026-09-11")?.status).toBe("HOME_OFFICE");
  });

  it("prevents a Home Office Friday followed by a Home Office Monday", () => {
    const longWeekend = solveSchedule({ month: month("2026-09"), manualHomeOfficeDays: ["2026-09-04", "2026-09-07"], rules: [rule({ type: "NOT_BOTH_HOME_OFFICE", weekdays: [1, 5] }, "mon-fri")] });
    expect(longWeekend.status).toBe("NO_VALID_SCHEDULE");

    const sameCalendarRow = solveSchedule({ month: month("2026-09"), manualHomeOfficeDays: ["2026-09-07", "2026-09-11"], rules: [rule({ type: "NOT_BOTH_HOME_OFFICE", weekdays: [1, 5] }, "mon-fri")] });
    expect(sameCalendarRow.status).toBe("OPTIMAL");
  });

  it("meets a weekly minimum with the fewest Office days", () => {
    const result = solveSchedule({ month: month("2025-09"), rules: [rule({ type: "MIN_OFFICE_DAYS_WEEK", minimum: 2 }, "weekly-min")] });
    expect(result.status).toBe("OPTIMAL");
    expect(result.bestOfficeDays).toBe(10);
    expect(result.officePercentage).toBe(45.5);
  });

  it("reports contradictory direct rules", () => {
    const result = solveSchedule({ month: month("2025-09"), rules: [rule({ type: "MANDATORY_WEEKDAY", weekday: 2, status: "OFFICE" }, "must-office"), rule({ type: "FORBIDDEN_WEEKDAY", weekday: 2, status: "OFFICE" }, "cannot-office")] });
    expect(result.status).toBe("NO_VALID_SCHEDULE");
    expect(result.conflicts[0].ruleIds).toEqual(expect.arrayContaining(["must-office", "cannot-office"]));
  });

  it("returns an optimal result even when it exceeds 50%", () => {
    const result = solveSchedule({ month: month("2025-09"), rules: [
      rule({ type: "MANDATORY_WEEKDAY", weekday: 1, status: "OFFICE" }, "mondays"),
      rule({ type: "MANDATORY_WEEKDAY", weekday: 2, status: "OFFICE" }, "tuesdays"),
      rule({ type: "MANDATORY_WEEKDAY", weekday: 4, status: "OFFICE" }, "thursdays"),
    ] });
    expect(result.status).toBe("OPTIMAL");
    expect(result.officePercentage).toBeGreaterThan(50);
    expect(result.bestOfficeDays).toBe(14);
  });

  it("excludes holidays and vacation from the eligible denominator", () => {
    const result = solveSchedule({ month: month("2025-09"), publicHolidays: ["2025-09-02"], vacation: ["2025-09-03"], rules: [] });
    expect(result.eligibleDays).toHaveLength(20);
    expect(result.eligibleDays.map((day) => day.dateKey)).not.toEqual(expect.arrayContaining(["2025-09-02", "2025-09-03"]));
    expect(result.officePercentage).toBe(0);
  });

  it("keeps approved Home Office in attendance while exempting it from the rules", () => {
    const result = solveSchedule({
      month: month("2025-09"),
      approvedHomeOfficeDays: ["2025-09-02", "2025-09-05", "2025-09-08"],
      rules: [
        rule({ type: "MANDATORY_WEEKDAY", weekday: 2, status: "OFFICE" }, "tuesday-office"),
        rule({ type: "MAX_HOME_OFFICE_DAYS_WEEK", maximum: 0 }, "no-rule-home-office"),
        rule({ type: "NOT_BOTH_HOME_OFFICE", weekdays: [1, 5] }, "mon-fri-home-office"),
      ],
    });
    expect(result.status).toBe("OPTIMAL");
    expect(result.eligibleDays.map((day) => day.dateKey)).toEqual(expect.arrayContaining(["2025-09-02", "2025-09-05", "2025-09-08"]));
    expect(result.schedules[0].days.filter((day) => day.status === "APPROVED_HOME_OFFICE")).toHaveLength(3);
    expect(result.schedules[0].days.filter((day) => day.status === "HOME_OFFICE")).toHaveLength(0);
    expect(result.bestOfficeDays).toBe(19);
    expect(result.officePercentage).toBe(86.4);
  });

  it("keeps manually recorded Office days fixed, while a holiday still excludes the date", () => {
    const result = solveSchedule({ month: month("2025-09"), manualOfficeDays: ["2025-09-01", "2025-09-02"], publicHolidays: ["2025-09-02"], rules: [] });
    expect(result.status).toBe("OPTIMAL");
    expect(result.bestOfficeDays).toBe(1);
    expect(officeDates(result)).toEqual(["2025-09-01"]);
    expect(result.eligibleDays).not.toEqual(expect.arrayContaining([expect.objectContaining({ dateKey: "2025-09-02" })]));
  });

  it("supports a maximum Home Office days per week", () => {
    const result = solveSchedule({ month: month("2025-09"), rules: [rule({ type: "MAX_HOME_OFFICE_DAYS_WEEK", maximum: 3 }, "home-office-cap")] });
    expect(result.status).toBe("OPTIMAL");
    expect(result.bestOfficeDays).toBe(8);
    for (const week of new Set(result.schedules[0].days.map((day) => day.weekKey))) {
      const weekDays = result.schedules[0].days.filter((day) => day.weekKey === week);
      expect(weekDays.filter((day) => day.status === "HOME_OFFICE").length).toBeLessThanOrEqual(3);
    }
  });

  it("supports a maximum Home Office count for a given weekday in the month", () => {
    const result = solveSchedule({ month: month("2025-09"), rules: [rule({ type: "MAX_HOME_OFFICE_ON_WEEKDAY", weekday: 1, maximum: 2 }, "monday-home-cap")] });
    expect(result.status).toBe("OPTIMAL");
    expect(result.bestOfficeDays).toBe(3);
    expect(result.schedules[0].days.filter((day) => day.weekday === 1 && day.status === "HOME_OFFICE")).toHaveLength(2);
  });

  it("keeps manual Office and manual cannot-be-in-Office marks fixed", () => {
    const result = solveSchedule({ month: month("2025-09"), manualOfficeDays: ["2025-09-01"], manualHomeOfficeDays: ["2025-09-02"], rules: [] });
    expect(result.status).toBe("OPTIMAL");
    expect(officeDates(result)).toEqual(["2025-09-01"]);
    expect(result.schedules[0].days.find((day) => day.dateKey === "2025-09-02")?.reasons[0]).toContain("can’t be in Office");
  });

  it("handles leap years and month boundaries", () => {
    const days = getEligibleWorkingDays({ month: month("2024-02") });
    expect(days[0].dateKey).toBe("2024-02-01");
    expect(days.at(-1)?.dateKey).toBe("2024-02-29");
    const result = solveSchedule({ month: month("2024-02"), rules: [rule({ type: "MANDATORY_WEEKDAY", weekday: 4, status: "OFFICE" }, "thursdays")] });
    expect(officeDates(result)).toEqual(["2024-02-01", "2024-02-08", "2024-02-15", "2024-02-22", "2024-02-29"]);
  });
});


describe("preferences and adjacent months", () => {
  it("prefers Tuesday but permits a mandatory home day", () => {
    const result = solveSchedule({ month: month("2026-09"), rules: [
      rule({ type: "PREFERRED_WEEKDAY", weekday: 2, status: "OFFICE" }),
      rule({ type: "SPECIFIC_DATE", date: "2026-09-08", status: "HOME_OFFICE" }),
    ] });
    expect(result.status).toBe("OPTIMAL");
    expect(officeDates(result)).toEqual(["2026-09-01", "2026-09-15", "2026-09-22", "2026-09-29"]);
  });

  it("lets a weekly hard maximum override the preference", () => {
    const result = solveSchedule({ month: month("2026-09"), rules: [
      rule({ type: "PREFERRED_WEEKDAY", weekday: 2, status: "OFFICE" }),
      rule({ type: "MAX_OFFICE_DAYS_WEEK", maximum: 0 }),
    ] });
    expect(result.status).toBe("OPTIMAL");
    expect(result.bestOfficeDays).toBe(0);
  });

  it.each([
    ["2026-06", "2026-05-29", "2026-06-01"],
    ["2026-07", "2026-07-31", "2026-08-03"],
    ["2026-05", "2026-05-29", "2026-06-01"],
  ])("checks cross-month weekends for %s", (selectedMonth, friday, monday) => {
    const result = solveSchedule({ month: month(selectedMonth), includeAdjacentDays: true,
      manualHomeOfficeDays: [friday, monday],
      rules: [rule({ type: "NOT_BOTH_HOME_OFFICE", weekdays: [1, 5] })] });
    expect(result.eligibleDays.map((day) => day.dateKey)).toEqual(expect.arrayContaining([friday, monday]));
    expect(result.status).toBe("NO_VALID_SCHEDULE");
  });

  it("shows complete weeks but reports selected-month attendance", () => {
    const result = solveSchedule({ month: month("2026-09"), includeAdjacentDays: true,
      rules: [rule({ type: "MANDATORY_WEEKDAY", weekday: 1, status: "OFFICE" })] });
    expect(result.schedules[0].days.find((day) => day.dateKey === "2026-08-31")?.status).toBe("OFFICE");
    expect(result.bestOfficeDays).toBe(4);
    expect(result.officePercentage).toBe(18.2);
  });

  it("keeps weekday caps separate for each month", () => {
    const result = solveSchedule({ month: month("2026-09"), includeAdjacentDays: true,
      manualHomeOfficeDays: ["2026-08-31", "2026-09-07"],
      rules: [rule({ type: "MAX_HOME_OFFICE_ON_WEEKDAY", weekday: 1, maximum: 1 })] });
    expect(result.status).toBe("OPTIMAL");
  });
});
