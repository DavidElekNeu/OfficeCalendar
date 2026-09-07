import { z } from "zod";
import type { Language } from "../i18n";

export const dayStatusSchema = z.enum(["OFFICE", "HOME_OFFICE"]);
export type DayStatus = z.infer<typeof dayStatusSchema>;
export type ScheduleDayStatus = DayStatus | "APPROVED_HOME_OFFICE";

export const weekdaySchema = z.number().int().min(0).max(6);

const baseRuleSchema = z.object({
  id: z.string(),
  enabled: z.boolean().default(true),
  label: z.string().optional(),
});

export const ruleSchema = z.discriminatedUnion("type", [
  baseRuleSchema.extend({ type: z.literal("PREFERRED_WEEKDAY"), weekday: weekdaySchema, status: dayStatusSchema }),
  baseRuleSchema.extend({ type: z.literal("MANDATORY_WEEKDAY"), weekday: weekdaySchema, status: dayStatusSchema }),
  baseRuleSchema.extend({ type: z.literal("FORBIDDEN_WEEKDAY"), weekday: weekdaySchema, status: dayStatusSchema }),
  baseRuleSchema.extend({ type: z.literal("SPECIFIC_DATE"), date: z.string(), status: dayStatusSchema }),
  baseRuleSchema.extend({ type: z.literal("NTH_WEEK_WEEKDAY"), week: z.number().int().min(1).max(6), weekday: weekdaySchema, status: dayStatusSchema }),
  baseRuleSchema.extend({ type: z.literal("MIN_OFFICE_DAYS_WEEK"), minimum: z.number().int().min(0).max(7) }),
  baseRuleSchema.extend({ type: z.literal("MAX_OFFICE_DAYS_WEEK"), maximum: z.number().int().min(0).max(7) }),
  baseRuleSchema.extend({ type: z.literal("MAX_HOME_OFFICE_DAYS_WEEK"), maximum: z.number().int().min(0).max(7) }),
  baseRuleSchema.extend({ type: z.literal("MAX_HOME_OFFICE_ON_WEEKDAY"), weekday: weekdaySchema, maximum: z.number().int().min(0).max(6) }),
  baseRuleSchema.extend({ type: z.literal("NOT_BOTH_HOME_OFFICE"), weekdays: z.array(weekdaySchema).length(2) }),
  baseRuleSchema.extend({ type: z.literal("MAX_CONSECUTIVE_HOME_OFFICE"), maximum: z.number().int().min(0).max(31) }),
]);

export type Rule = z.infer<typeof ruleSchema>;

export type CalendarInput = {
  month: Date;
  includeAdjacentDays?: boolean;
  publicHolidays?: string[];
  vacation?: string[];
  approvedHomeOfficeDays?: string[];
  manualOfficeDays?: string[];
  manualHomeOfficeDays?: string[];
};

export type EligibleDay = {
  date: Date;
  dateKey: string;
  weekday: number;
  weekKey: string;
  weekIndex: number;
};

export type ScheduleDay = EligibleDay & {
  status: ScheduleDayStatus;
  reasons: string[];
};

export type Schedule = {
  days: ScheduleDay[];
  officeDays: number;
  officePercentage: number;
};

export type Conflict = {
  ruleIds: string[];
  message: string;
};

export type SolverResult = {
  status: "OPTIMAL" | "NO_VALID_SCHEDULE";
  eligibleDays: EligibleDay[];
  schedules: Schedule[];
  bestOfficeDays: number | null;
  officePercentage: number | null;
  conflicts: Conflict[];
  stats: { nodesVisited: number; prunedBranches: number };
};

export type PlannerScenario = {
  id: string;
  name: string;
  month: string;
  rules: Rule[];
  publicHolidays: string[];
  vacation: string[];
  approvedHomeOfficeDays: string[];
  manualOfficeDays: string[];
  manualHomeOfficeDays: string[];
};

export type PlannerPreferences = {
  attendanceTarget: number;
  activeScenarioId: string;
  language: Language;
  darkMode: boolean;
};
