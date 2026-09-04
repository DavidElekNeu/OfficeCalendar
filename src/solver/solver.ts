import { format, getDaysInMonth, isValid, parseISO } from "date-fns";
import { localeForLanguage, t, type Language } from "../i18n";
import { getEligibleWorkingDays } from "./calendar";
import { describeRule, getDirectStatus, isMondayFridayPair, ruleShortLabel, statusLabel } from "./rules";
import type { CalendarInput, Conflict, DayStatus, EligibleDay, Rule, Schedule, ScheduleDay, ScheduleDayStatus, SolverResult } from "./types";

type SolverOptions = CalendarInput & { rules: Rule[]; maxSchedules?: number; language?: Language };
type Assignment = Map<string, ScheduleDayStatus>;

export function solveSchedule(options: SolverOptions): SolverResult {
  const eligibleDays = getEligibleWorkingDays(options);
  const approvedHomeOfficeSet = new Set(options.approvedHomeOfficeDays ?? []);
  const ruleDays = eligibleDays.filter((day) => !approvedHomeOfficeSet.has(day.dateKey));
  const language = options.language ?? "en";
  const recordedOfficeRules: Rule[] = (options.manualOfficeDays ?? []).map((date) => ({
    id: `manual-office-${date}`,
    enabled: true,
    type: "SPECIFIC_DATE",
    date,
    status: "OFFICE",
    label: t(language, "manualOffice"),
  }));
  const recordedHomeOfficeRules: Rule[] = (options.manualHomeOfficeDays ?? []).map((date) => ({
    id: `manual-home-office-${date}`,
    enabled: true,
    type: "SPECIFIC_DATE",
    date,
    status: "HOME_OFFICE",
    label: t(language, "manualHomeOffice"),
  }));
  const activeRules = [...options.rules.filter((rule) => rule.enabled), ...recordedOfficeRules, ...recordedHomeOfficeRules];
  const maxSchedules = options.maxSchedules ?? 5;
  const stats = { nodesVisited: 0, prunedBranches: 0 };
  const conflicts = detectStaticContradictions(ruleDays, activeRules, language);

  if (conflicts.length > 0) {
    return { status: "NO_VALID_SCHEDULE", eligibleDays, schedules: [], bestOfficeDays: null, officePercentage: null, conflicts, stats };
  }

  const directAssignments = new Map<string, DayStatus>();
  for (const day of ruleDays) {
    const directive = getDirectStatus(day, activeRules);
    if (directive.status) directAssignments.set(day.dateKey, directive.status);
  }

  const directConflict = findDirectContradictions(ruleDays, activeRules, language);
  if (directConflict.length > 0) {
    return { status: "NO_VALID_SCHEDULE", eligibleDays, schedules: [], bestOfficeDays: null, officePercentage: null, conflicts: directConflict, stats };
  }

  const variableDays = ruleDays.filter((day) => !directAssignments.has(day.dateKey));
  const orderedDays = [...variableDays].sort((a, b) => {
    const aPressure = getDayPressure(a, activeRules);
    const bPressure = getDayPressure(b, activeRules);
    return bPressure - aPressure || a.dateKey.localeCompare(b.dateKey);
  });
  let bestOfficeDays = Number.POSITIVE_INFINITY;
  const schedules: Schedule[] = [];
  const assignment: Assignment = new Map(directAssignments);
  for (const day of eligibleDays) {
    if (approvedHomeOfficeSet.has(day.dateKey)) assignment.set(day.dateKey, "APPROVED_HOME_OFFICE");
  }

  const search = (index: number) => {
    stats.nodesVisited += 1;
    const assignedOfficeDays = countStatus(assignment, "OFFICE");
    if (assignedOfficeDays > bestOfficeDays) {
      stats.prunedBranches += 1;
      return;
    }

    const partial = evaluatePartial(ruleDays, assignment, activeRules);
    if (!partial.valid) {
      stats.prunedBranches += 1;
      return;
    }

    const remainingOfficeLowerBound = assignedOfficeDays + partial.requiredOfficeDays;
    if (remainingOfficeLowerBound > bestOfficeDays) {
      stats.prunedBranches += 1;
      return;
    }

    if (index >= orderedDays.length) {
      const finalEvaluation = evaluateComplete(ruleDays, assignment, activeRules);
      if (!finalEvaluation.valid) {
        stats.prunedBranches += 1;
        return;
      }
      const schedule = makeSchedule(eligibleDays, assignment, activeRules, language);
      if (schedule.officeDays < bestOfficeDays) {
        bestOfficeDays = schedule.officeDays;
        schedules.length = 0;
        schedules.push(schedule);
      } else if (schedule.officeDays === bestOfficeDays && schedules.length < maxSchedules && !containsSchedule(schedules, schedule)) {
        schedules.push(schedule);
      }
      return;
    }

    const day = orderedDays[index];
    // Home Office is searched first because Office is the objective we minimize.
    assignment.set(day.dateKey, "HOME_OFFICE");
    search(index + 1);
    assignment.set(day.dateKey, "OFFICE");
    search(index + 1);
    assignment.delete(day.dateKey);
  };

  if (ruleDays.length === 0) {
    const emptyEvaluation = evaluateComplete(ruleDays, assignment, activeRules);
    if (emptyEvaluation.valid) schedules.push(makeSchedule(eligibleDays, assignment, activeRules, language));
  } else {
    search(0);
  }

  if (schedules.length === 0) {
    return {
      status: "NO_VALID_SCHEDULE",
      eligibleDays,
      schedules: [],
      bestOfficeDays: null,
      officePercentage: null,
      conflicts: inferConflicts(ruleDays, activeRules, language),
      stats,
    };
  }

  return {
    status: "OPTIMAL",
    eligibleDays,
    schedules,
    bestOfficeDays,
    officePercentage: percentage(bestOfficeDays, eligibleDays.length),
    conflicts: [],
    stats,
  };
}

function detectStaticContradictions(days: EligibleDay[], rules: Rule[], language: Language): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const rule of rules) {
    if (rule.type === "MIN_OFFICE_DAYS_WEEK" && rule.minimum > 5) {
      conflicts.push({ ruleIds: [rule.id], message: `${describeRule(rule, language)} is impossible on a Monday–Friday workweek.` });
    }
    if (rule.type === "MAX_OFFICE_DAYS_WEEK" && rule.maximum < 0) {
      conflicts.push({ ruleIds: [rule.id], message: `${describeRule(rule, language)} has an invalid limit.` });
    }
    if (rule.type === "MAX_CONSECUTIVE_HOME_OFFICE" && rule.maximum < 0) {
      conflicts.push({ ruleIds: [rule.id], message: `${describeRule(rule, language)} has an invalid limit.` });
    }
  }
  const minRules = rules.filter((rule): rule is Extract<Rule, { type: "MIN_OFFICE_DAYS_WEEK" }> => rule.type === "MIN_OFFICE_DAYS_WEEK");
  const maxRules = rules.filter((rule): rule is Extract<Rule, { type: "MAX_OFFICE_DAYS_WEEK" }> => rule.type === "MAX_OFFICE_DAYS_WEEK");
  if (minRules.length > 0 && maxRules.length > 0) {
    const minimum = Math.max(...minRules.map((rule) => rule.minimum));
    const maximum = Math.min(...maxRules.map((rule) => rule.maximum));
    if (minimum > maximum) conflicts.push({ ruleIds: [...minRules.filter((rule) => rule.minimum === minimum), ...maxRules.filter((rule) => rule.maximum === maximum)].map((rule) => rule.id), message: `Weekly minimum (${minimum}) is greater than weekly maximum (${maximum}).` });
  }
  const homeMaxRules = rules.filter((rule): rule is Extract<Rule, { type: "MAX_HOME_OFFICE_DAYS_WEEK" }> => rule.type === "MAX_HOME_OFFICE_DAYS_WEEK");
  if (homeMaxRules.length > 0) {
    const homeMaximum = Math.min(...homeMaxRules.map((rule) => rule.maximum));
    const minimum = getWeeklyMinimum(rules);
    for (const [weekKey, weekDays] of Object.entries(groupByWeek(days))) {
      const requiredOffice = Math.max(minimum, weekDays.length - homeMaximum);
      if (requiredOffice > getWeeklyMaximum(rules)) {
        conflicts.push({ ruleIds: [...minRules.filter((rule) => rule.minimum === minimum), ...homeMaxRules.filter((rule) => rule.maximum === homeMaximum), ...rules.filter((rule) => rule.type === "MAX_OFFICE_DAYS_WEEK")].map((rule) => rule.id), message: `Week of ${format(parseISO(weekKey), "MMM d", { locale: localeForLanguage(language) })} needs at least ${requiredOffice} Office days, but another weekly limit is lower.` });
      }
    }
  }
  if (days.length > 0) {
    for (const day of days) {
      const direct = rules.filter((rule): rule is Extract<Rule, { type: "MANDATORY_WEEKDAY" | "SPECIFIC_DATE" | "NTH_WEEK_WEEKDAY" }> => (rule.type === "MANDATORY_WEEKDAY" && rule.weekday === day.weekday) || (rule.type === "SPECIFIC_DATE" && rule.date === day.dateKey) || (rule.type === "NTH_WEEK_WEEKDAY" && rule.week === day.weekIndex && rule.weekday === day.weekday));
      const forbidden = rules.filter((rule): rule is Extract<Rule, { type: "FORBIDDEN_WEEKDAY" }> => rule.type === "FORBIDDEN_WEEKDAY" && rule.weekday === day.weekday);
      const requiredStatuses = new Set(direct.map((rule) => rule.status));
      if (requiredStatuses.size > 1 || (requiredStatuses.has("OFFICE") && forbidden.some((rule) => rule.status === "OFFICE")) || (requiredStatuses.has("HOME_OFFICE") && forbidden.some((rule) => rule.status === "HOME_OFFICE"))) {
        conflicts.push({ ruleIds: [...direct, ...forbidden].map((rule) => rule.id), message: `Two direct rules require ${format(day.date, "MMM d")} to be different statuses.` });
      }
    }
  }
  return uniqueConflicts(conflicts);
}

function findDirectContradictions(days: EligibleDay[], rules: Rule[], language: Language): Conflict[] {
  return detectStaticContradictions(days, rules, language).filter((conflict) => conflict.ruleIds.length > 0);
}

function evaluatePartial(days: EligibleDay[], assignment: Assignment, rules: Rule[]) {
  let requiredOfficeDays = 0;
  const weeks = groupByWeek(days);
  for (const [weekKey, weekDays] of Object.entries(weeks)) {
    const assigned = weekDays.filter((day) => assignment.has(day.dateKey));
    const officeCount = assigned.filter((day) => assignment.get(day.dateKey) === "OFFICE").length;
    const homeOfficeCount = assigned.filter((day) => assignment.get(day.dateKey) === "HOME_OFFICE").length;
    const missing = weekDays.length - assigned.length;
    const min = getWeeklyMinimum(rules);
    const max = getWeeklyMaximum(rules);
    const homeMax = getWeeklyHomeOfficeMaximum(rules);
    if (officeCount > max) return { valid: false, requiredOfficeDays: 0 };
    if (homeOfficeCount > homeMax) return { valid: false, requiredOfficeDays: 0 };
    if (officeCount + missing < min) return { valid: false, requiredOfficeDays: 0 };
    requiredOfficeDays += Math.max(0, min - officeCount);
    if (weekDays.length === 0 || weekKey.length === 0) return { valid: false, requiredOfficeDays: 0 };
  }

  if (!satisfiesPairRules(days, assignment, rules, false)) return { valid: false, requiredOfficeDays: 0 };
  if (!satisfiesConsecutiveHomeOffice(days, assignment, rules, false)) return { valid: false, requiredOfficeDays: 0 };
  if (!satisfiesWeekdayHomeOfficeCaps(days, assignment, rules)) return { valid: false, requiredOfficeDays: 0 };
  return { valid: true, requiredOfficeDays };
}

function evaluateComplete(days: EligibleDay[], assignment: Assignment, rules: Rule[]) {
  const partial = evaluatePartial(days, assignment, rules);
  if (!partial.valid) return partial;
  const weeklyMin = getWeeklyMinimum(rules);
  const weeklyMax = getWeeklyMaximum(rules);
  const weeklyHomeMax = getWeeklyHomeOfficeMaximum(rules);
  for (const weekDays of Object.values(groupByWeek(days))) {
    const officeCount = weekDays.filter((day) => assignment.get(day.dateKey) === "OFFICE").length;
    const homeOfficeCount = weekDays.filter((day) => assignment.get(day.dateKey) === "HOME_OFFICE").length;
    if (officeCount < weeklyMin || officeCount > weeklyMax || homeOfficeCount > weeklyHomeMax) return { valid: false, requiredOfficeDays: 0 };
  }
  return { valid: true, requiredOfficeDays: 0 };
}

function satisfiesPairRules(days: EligibleDay[], assignment: Assignment, rules: Rule[], complete: boolean) {
  const pairs = rules.filter((rule): rule is Extract<Rule, { type: "NOT_BOTH_HOME_OFFICE" }> => rule.type === "NOT_BOTH_HOME_OFFICE");
  for (const rule of pairs) {
    const weeks = Object.values(groupByWeek(days));
    if (isMondayFridayPair(rule)) {
      for (let index = 0; index < weeks.length - 1; index += 1) {
        const friday = weeks[index].find((day) => day.weekday === 5);
        const followingMonday = weeks[index + 1].find((day) => day.weekday === 1);
        if (!friday || !followingMonday) continue;
        const statuses = [assignment.get(friday.dateKey), assignment.get(followingMonday.dateKey)];
        if (statuses.every((status) => status === "HOME_OFFICE")) return false;
        if (complete && statuses.some((status) => !status)) return false;
      }
      continue;
    }
    for (const weekDays of weeks) {
      const matching = rule.weekdays.map((weekday) => weekDays.find((day) => day.weekday === weekday));
      if (matching.some((day) => !day)) continue;
      const statuses = matching.map((day) => assignment.get(day!.dateKey));
      if (statuses.every((status) => status === "HOME_OFFICE")) return false;
      if (complete && statuses.some((status) => !status)) return false;
    }
  }
  return true;
}

function satisfiesConsecutiveHomeOffice(days: EligibleDay[], assignment: Assignment, rules: Rule[], complete: boolean) {
  const max = Math.min(...rules.filter((rule): rule is Extract<Rule, { type: "MAX_CONSECUTIVE_HOME_OFFICE" }> => rule.type === "MAX_CONSECUTIVE_HOME_OFFICE").map((rule) => rule.maximum), Number.POSITIVE_INFINITY);
  if (!Number.isFinite(max)) return true;
  let streak = 0;
  for (const day of days) {
    const status = assignment.get(day.dateKey);
    if (status === "HOME_OFFICE") streak += 1;
    else if (status === "OFFICE") streak = 0;
    else if (complete) return false;
    if (streak > max) return false;
  }
  return true;
}

function satisfiesWeekdayHomeOfficeCaps(days: EligibleDay[], assignment: Assignment, rules: Rule[]) {
  const caps = rules.filter((rule): rule is Extract<Rule, { type: "MAX_HOME_OFFICE_ON_WEEKDAY" }> => rule.type === "MAX_HOME_OFFICE_ON_WEEKDAY");
  return caps.every((rule) => days.filter((day) => day.weekday === rule.weekday && assignment.get(day.dateKey) === "HOME_OFFICE").length <= rule.maximum);
}

function makeSchedule(days: EligibleDay[], assignment: Assignment, rules: Rule[], language: Language): Schedule {
  const scheduleDays: ScheduleDay[] = days.map((day) => {
    const status = assignment.get(day.dateKey) ?? "HOME_OFFICE";
    return { ...day, status, reasons: reasonsForDay(day, status, days, assignment, rules, language) };
  });
  const officeDays = scheduleDays.filter((day) => day.status === "OFFICE").length;
  return { days: scheduleDays, officeDays, officePercentage: percentage(officeDays, days.length) };
}

function reasonsForDay(day: EligibleDay, status: ScheduleDayStatus, days: EligibleDay[], assignment: Assignment, rules: Rule[], language: Language) {
  const reasons = rules.filter((rule) => {
    if (rule.type === "MANDATORY_WEEKDAY") return rule.weekday === day.weekday && rule.status === status;
    if (rule.type === "FORBIDDEN_WEEKDAY") return rule.weekday === day.weekday && rule.status !== status;
    if (rule.type === "SPECIFIC_DATE") return rule.date === day.dateKey && rule.status === status;
    if (rule.type === "NTH_WEEK_WEEKDAY") return rule.week === day.weekIndex && rule.weekday === day.weekday && rule.status === status;
    return false;
  }).map((rule) => ruleShortLabel(rule, language));

  if (status === "OFFICE") {
    const weekDays = days.filter((candidate) => candidate.weekKey === day.weekKey);
    const min = getWeeklyMinimum(rules);
    const alreadyOffice = weekDays.filter((candidate) => candidate.dateKey !== day.dateKey && assignment.get(candidate.dateKey) === "OFFICE").length;
    if (reasons.length === 0 && alreadyOffice < min) reasons.push(t(language, "reasonWeeklyMinimum"));
    const weekdayCap = rules.find((rule): rule is Extract<Rule, { type: "MAX_HOME_OFFICE_ON_WEEKDAY" }> => rule.type === "MAX_HOME_OFFICE_ON_WEEKDAY" && rule.weekday === day.weekday);
    const otherHomeOfficeOnWeekday = days.filter((candidate) => candidate.weekday === day.weekday && candidate.dateKey !== day.dateKey && assignment.get(candidate.dateKey) === "HOME_OFFICE").length;
    if (reasons.length === 0 && weekdayCap && otherHomeOfficeOnWeekday >= weekdayCap.maximum) reasons.push(t(language, "reasonWeekdayCap", { maximum: weekdayCap.maximum, day: language === "hu" ? "napot" : weekdayCap.maximum === 1 ? "day" : "days" }));
    if (reasons.length === 0) reasons.push(t(language, "reasonChosen"));
  }
  if (status === "HOME_OFFICE" && reasons.length === 0) reasons.push(t(language, "reasonKeepsMinimum"));
  if (status === "APPROVED_HOME_OFFICE") reasons.push(t(language, "reasonApprovedHomeOffice"));
  return reasons;
}

function getWeeklyMinimum(rules: Rule[]) {
  return Math.max(0, ...rules.filter((rule): rule is Extract<Rule, { type: "MIN_OFFICE_DAYS_WEEK" }> => rule.type === "MIN_OFFICE_DAYS_WEEK").map((rule) => rule.minimum));
}

function getWeeklyMaximum(rules: Rule[]) {
  return Math.min(5, ...rules.filter((rule): rule is Extract<Rule, { type: "MAX_OFFICE_DAYS_WEEK" }> => rule.type === "MAX_OFFICE_DAYS_WEEK").map((rule) => rule.maximum));
}

function getWeeklyHomeOfficeMaximum(rules: Rule[]) {
  return Math.min(5, ...rules.filter((rule): rule is Extract<Rule, { type: "MAX_HOME_OFFICE_DAYS_WEEK" }> => rule.type === "MAX_HOME_OFFICE_DAYS_WEEK").map((rule) => rule.maximum));
}

function getDayPressure(day: EligibleDay, rules: Rule[]) {
  let pressure = 0;
  for (const rule of rules) {
    if ((rule.type === "MANDATORY_WEEKDAY" || rule.type === "FORBIDDEN_WEEKDAY") && rule.weekday === day.weekday) pressure += 4;
    if (rule.type === "SPECIFIC_DATE" && rule.date === day.dateKey) pressure += 5;
    if (rule.type === "NTH_WEEK_WEEKDAY" && rule.week === day.weekIndex && rule.weekday === day.weekday) pressure += 5;
    if (rule.type === "NOT_BOTH_HOME_OFFICE" && rule.weekdays.includes(day.weekday)) pressure += 2;
    if (rule.type === "MAX_HOME_OFFICE_ON_WEEKDAY" && rule.weekday === day.weekday) pressure += 2;
  }
  return pressure;
}

function groupByWeek(days: EligibleDay[]) {
  return days.reduce<Record<string, EligibleDay[]>>((groups, day) => {
    (groups[day.weekKey] ??= []).push(day);
    return groups;
  }, {});
}

function countStatus(assignment: Assignment, status: DayStatus) {
  return [...assignment.values()].filter((value) => value === status).length;
}

function percentage(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 1000) / 10;
}

function containsSchedule(schedules: Schedule[], candidate: Schedule) {
  const signature = candidate.days.map((day) => `${day.dateKey}:${day.status}`).join("|");
  return schedules.some((schedule) => schedule.days.map((day) => `${day.dateKey}:${day.status}`).join("|") === signature);
}

function inferConflicts(days: EligibleDay[], rules: Rule[], language: Language): Conflict[] {
  const conflicts: Conflict[] = [];
  const min = getWeeklyMinimum(rules);
  for (const [weekKey, weekDays] of Object.entries(groupByWeek(days))) {
    const fixedOffice = weekDays.filter((day) => getDirectStatus(day, rules).status === "OFFICE").length;
    const possibleOffice = weekDays.filter((day) => getDirectStatus(day, rules).status !== "HOME_OFFICE").length;
    if (possibleOffice < min) {
      const minRuleIds = rules.filter((rule) => rule.type === "MIN_OFFICE_DAYS_WEEK" && rule.minimum === min).map((rule) => rule.id);
      conflicts.push({ ruleIds: minRuleIds, message: `Week of ${format(parseISO(weekKey), "MMM d", { locale: localeForLanguage(language) })} can provide only ${possibleOffice} Office ${possibleOffice === 1 ? "day" : "days"}, below the minimum of ${min}.` });
    }
    if (fixedOffice > getWeeklyMaximum(rules)) conflicts.push({ ruleIds: rules.filter((rule) => rule.type === "MAX_OFFICE_DAYS_WEEK").map((rule) => rule.id), message: `Week of ${format(parseISO(weekKey), "MMM d", { locale: localeForLanguage(language) })} already exceeds the weekly Office maximum.` });
    const fixedHomeOffice = weekDays.filter((day) => getDirectStatus(day, rules).status === "HOME_OFFICE").length;
    if (fixedHomeOffice > getWeeklyHomeOfficeMaximum(rules)) conflicts.push({ ruleIds: rules.filter((rule) => rule.type === "MAX_HOME_OFFICE_DAYS_WEEK").map((rule) => rule.id), message: `Week of ${format(parseISO(weekKey), "MMM d", { locale: localeForLanguage(language) })} already exceeds the weekly Home Office maximum.` });
  }
  for (const rule of rules.filter((candidate): candidate is Extract<Rule, { type: "MAX_HOME_OFFICE_ON_WEEKDAY" }> => candidate.type === "MAX_HOME_OFFICE_ON_WEEKDAY")) {
    const fixedHomeOffice = days.filter((day) => day.weekday === rule.weekday && getDirectStatus(day, rules).status === "HOME_OFFICE").length;
    if (fixedHomeOffice > rule.maximum) conflicts.push({ ruleIds: [rule.id], message: `${describeRule(rule, language)} is already exceeded by fixed Home Office days.` });
  }
  return uniqueConflicts(conflicts.length > 0 ? conflicts : [{ ruleIds: rules.map((rule) => rule.id), message: "The selected rules cannot be satisfied together for this month." }]);
}

function uniqueConflicts(conflicts: Conflict[]) {
  const seen = new Set<string>();
  return conflicts.filter((conflict) => {
    const key = `${conflict.ruleIds.join(",")}:${conflict.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function validateMonthKey(value: string) {
  const date = parseISO(`${value}-01`);
  return isValid(date) && getDaysInMonth(date) > 0 && format(date, "yyyy-MM") === value;
}
