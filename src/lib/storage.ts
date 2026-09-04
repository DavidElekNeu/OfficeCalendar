import { z } from "zod";
import { ruleSchema } from "../solver/types";
import type { PlannerPreferences, PlannerScenario, Rule } from "../solver/types";

const STORAGE_KEY = "hybrid-office-planner:v1";

const legacyDefaultRuleSets: Rule[][] = [
  [
    { id: "default-tuesdays", enabled: true, type: "MANDATORY_WEEKDAY", weekday: 2, status: "OFFICE" },
    { id: "default-wednesday-home", enabled: true, type: "FORBIDDEN_WEEKDAY", weekday: 3, status: "OFFICE" },
    { id: "default-weekly-minimum", enabled: true, type: "MIN_OFFICE_DAYS_WEEK", minimum: 2 },
    { id: "default-monday-friday", enabled: true, type: "NOT_BOTH_HOME_OFFICE", weekdays: [1, 5] },
    { id: "default-third-thursday", enabled: true, type: "NTH_WEEK_WEEKDAY", week: 3, weekday: 4, status: "OFFICE" },
  ],
  [
    { id: "default-tuesdays", enabled: true, type: "MANDATORY_WEEKDAY", weekday: 2, status: "OFFICE" },
    { id: "default-monday-friday", enabled: true, type: "NOT_BOTH_HOME_OFFICE", weekdays: [1, 5] },
    { id: "default-third-thursday", enabled: true, type: "NTH_WEEK_WEEKDAY", week: 3, weekday: 4, status: "OFFICE" },
  ],
];

const scenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  rules: z.array(ruleSchema),
  publicHolidays: z.array(z.string()),
  vacation: z.array(z.string()),
  approvedHomeOfficeDays: z.array(z.string()).default([]),
  manualOfficeDays: z.array(z.string()).default([]),
  manualHomeOfficeDays: z.array(z.string()).default([]),
});

const plannerStateSchema = z.object({
  scenarios: z.array(scenarioSchema).min(1),
  preferences: z.object({ attendanceTarget: z.number(), activeScenarioId: z.string(), language: z.enum(["hu", "en"]).default("hu"), darkMode: z.boolean().default(false) }),
});

export type PlannerState = { scenarios: PlannerScenario[]; preferences: PlannerPreferences };

export function loadPlannerState(fallback: PlannerState): PlannerState {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = plannerStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return fallback;
    const scenarios = parsed.data.scenarios.map((scenario) => scenario.id === "scenario-main" && legacyDefaultRuleSets.some((legacyRules) => JSON.stringify(scenario.rules) === JSON.stringify(legacyRules))
      ? { ...scenario, rules: createDefaultRules() }
      : scenario);
    const activeScenarioId = scenarios.some((scenario) => scenario.id === parsed.data.preferences.activeScenarioId)
      ? parsed.data.preferences.activeScenarioId
      : scenarios[0].id;
    return { scenarios, preferences: { ...parsed.data.preferences, activeScenarioId } };
  } catch {
    return fallback;
  }
}

export function savePlannerState(state: PlannerState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function createRuleId() {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createScenarioId() {
  return `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createDefaultRules(): Rule[] {
  return [
    { id: "default-tuesdays", enabled: true, type: "MANDATORY_WEEKDAY", weekday: 2, status: "OFFICE" },
    { id: "default-monday-friday", enabled: true, type: "NOT_BOTH_HOME_OFFICE", weekdays: [1, 5] },
    { id: "default-home-office-mondays", enabled: true, type: "MAX_HOME_OFFICE_ON_WEEKDAY", weekday: 1, maximum: 2 },
    { id: "default-home-office-fridays", enabled: true, type: "MAX_HOME_OFFICE_ON_WEEKDAY", weekday: 5, maximum: 2 },
  ];
}
