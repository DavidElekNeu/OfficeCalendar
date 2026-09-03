import { describe, expect, it } from "vitest";
import { createDefaultRules } from "./storage";

describe("planner defaults", () => {
  it("seeds exactly the four requested attendance rules", () => {
    expect(createDefaultRules()).toEqual([
      { id: "default-tuesdays", enabled: true, type: "MANDATORY_WEEKDAY", weekday: 2, status: "OFFICE" },
      { id: "default-monday-friday", enabled: true, type: "NOT_BOTH_HOME_OFFICE", weekdays: [1, 5] },
      { id: "default-home-office-mondays", enabled: true, type: "MAX_HOME_OFFICE_ON_WEEKDAY", weekday: 1, maximum: 2 },
      { id: "default-home-office-fridays", enabled: true, type: "MAX_HOME_OFFICE_ON_WEEKDAY", weekday: 5, maximum: 2 },
    ]);
  });
});
