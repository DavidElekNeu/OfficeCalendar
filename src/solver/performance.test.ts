import { it, expect } from "vitest";
import { solveSchedule } from "./solver";
import { createDefaultRules } from "../lib/storage";
it("prunes default searches while preserving the optimal September schedule", () => {
  for (const adjacent of [false, true]) for (const preferred of [false, true]) {
    const rules = createDefaultRules().map(rule => rule.type === "PREFERRED_WEEKDAY" && !preferred ? { ...rule, type: "MANDATORY_WEEKDAY" as const } : rule);
    const result = solveSchedule({ month: new Date(2026, 8, 1), rules, includeAdjacentDays: adjacent });
    expect(result.stats.nodesVisited).toBeLessThan(500);
    expect(result.bestOfficeDays).toBe(9);
    expect(result.schedules[0].days.filter(day => day.status === "OFFICE").map(day => day.dateKey)).toEqual([
      "2026-09-01", "2026-09-07", "2026-09-08", "2026-09-14", "2026-09-15",
      "2026-09-18", "2026-09-22", "2026-09-25", "2026-09-29",
    ]);
    expect(result.status).toBe("OPTIMAL");
  }
});
