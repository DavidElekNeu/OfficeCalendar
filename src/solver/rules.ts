import { format } from "date-fns";
import { localeForLanguage, weekdayNames, type Language } from "../i18n";
import type { EligibleDay, Rule, ScheduleDayStatus } from "./types";

export const statusLabel = (status: ScheduleDayStatus, language: Language = "en") => status === "OFFICE" ? (language === "hu" ? "Iroda" : "Office") : status === "HOME_OFFICE" ? (language === "hu" ? "Otthoni munka" : "Home Office") : (language === "hu" ? "Engedélyezett home office" : "Approved Home Office");

export function describeRule(rule: Rule, language: Language = "en"): string {
  const names = weekdayNames(language);
  const isHungarian = language === "hu";
  switch (rule.type) {
    case "PREFERRED_WEEKDAY": return isHungarian ? `Ajánlott hétköznap: ${names[rule.weekday]} · ${statusLabel(rule.status, language)}` : `Preferred weekday: ${names[rule.weekday]} · ${statusLabel(rule.status, language)}`;
    case "MANDATORY_WEEKDAY": return isHungarian ? `${names[rule.weekday]} kötelezően ${statusLabel(rule.status, language)}` : `${names[rule.weekday]} is mandatory ${statusLabel(rule.status, language)}`;
    case "FORBIDDEN_WEEKDAY": return isHungarian ? `${names[rule.weekday]} nem lehet ${statusLabel(rule.status, language)}` : `${names[rule.weekday]} cannot be ${statusLabel(rule.status, language)}`;
    case "SPECIFIC_DATE": return isHungarian ? `${formatDateLabel(rule.date, language)} dátumon ${statusLabel(rule.status, language)}` : `${formatDateLabel(rule.date, language)} must be ${statusLabel(rule.status, language)}`;
    case "NTH_WEEK_WEEKDAY": return isHungarian ? `${ordinal(rule.week, language)} naptári hét · ${names[rule.weekday]} ${statusLabel(rule.status, language)}` : `${ordinal(rule.week, language)} calendar week · ${names[rule.weekday]} is ${statusLabel(rule.status, language)}`;
    case "MIN_OFFICE_DAYS_WEEK": return isHungarian ? `Hetente legalább ${rule.minimum} irodai nap` : `At least ${rule.minimum} Office ${plural(rule.minimum, "day")} each week`;
    case "MAX_OFFICE_DAYS_WEEK": return isHungarian ? `Hetente legfeljebb ${rule.maximum} irodai nap` : `No more than ${rule.maximum} Office ${plural(rule.maximum, "day")} each week`;
    case "MAX_HOME_OFFICE_DAYS_WEEK": return isHungarian ? `Hetente legfeljebb ${rule.maximum} otthoni munkanap` : `No more than ${rule.maximum} Home Office ${plural(rule.maximum, "day")} each week`;
    case "MAX_HOME_OFFICE_ON_WEEKDAY": return isHungarian ? `Havonta legfeljebb ${rule.maximum} ${names[rule.weekday]}i otthoni munkanap` : `No more than ${rule.maximum} Home Office ${names[rule.weekday]}${rule.maximum === 1 ? "" : "s"} per month`;
    case "NOT_BOTH_HOME_OFFICE": return isMondayFridayPair(rule) ? (isHungarian ? "A pénteki és az azt követő hétfői nap nem lehet mindkettő otthoni munka" : "Friday and following Monday cannot both be Home Office") : (isHungarian ? `${names[rule.weekdays[0]]} és ${names[rule.weekdays[1]]} nem lehetnek egyszerre otthoni munkanapok ugyanazon hétfő–vasárnap héten` : `${names[rule.weekdays[0]]} and ${names[rule.weekdays[1]]} cannot both be Home Office in the same Monday–Sunday week`);
    case "MAX_CONSECUTIVE_HOME_OFFICE": return isHungarian ? `Legfeljebb ${rule.maximum} egymást követő otthoni munkanap` : `Maximum ${rule.maximum} consecutive Home Office ${plural(rule.maximum, "day")}`;
  }
}

export function isMondayFridayPair(rule: Extract<Rule, { type: "NOT_BOTH_HOME_OFFICE" }>) {
  return rule.weekdays.includes(1) && rule.weekdays.includes(5);
}

export function ruleShortLabel(rule: Rule, language: Language = "en"): string {
  if (rule.label) return rule.label;
  return describeRule(rule, language);
}

export function getDirectStatus(day: EligibleDay, rules: Rule[]): { status: "OFFICE" | "HOME_OFFICE" | null; ruleIds: string[] } {
  const activeRules = rules.filter((rule) => rule.enabled);
  const directives = activeRules.filter((rule) => {
    if (rule.type === "MANDATORY_WEEKDAY" || rule.type === "FORBIDDEN_WEEKDAY") return rule.weekday === day.weekday;
    if (rule.type === "SPECIFIC_DATE") return rule.date === day.dateKey;
    return rule.type === "NTH_WEEK_WEEKDAY" && rule.week === day.weekIndex && rule.weekday === day.weekday;
  });

  const required = directives.filter((rule) => rule.type === "MANDATORY_WEEKDAY" || rule.type === "SPECIFIC_DATE" || rule.type === "NTH_WEEK_WEEKDAY");
  const forbidden = directives.filter((rule) => rule.type === "FORBIDDEN_WEEKDAY");
  if (required.length > 0) return { status: required[0].status, ruleIds: required.map((rule) => rule.id) };
  if (forbidden.length > 0) return { status: forbidden[0].status === "OFFICE" ? "HOME_OFFICE" : "OFFICE", ruleIds: forbidden.map((rule) => rule.id) };
  return { status: null, ruleIds: [] };
}

function ordinal(value: number, language: Language) {
  if (language === "hu") return `${value}.`;
  if (value === 1) return "1st";
  if (value === 2) return "2nd";
  if (value === 3) return "3rd";
  return `${value}th`;
}

function plural(value: number, word: string) {
  return `${word}${value === 1 ? "" : "s"}`;
}

function formatDateLabel(value: string, language: Language) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return format(new Date(year, month - 1, day), "MMM d, yyyy", { locale: localeForLanguage(language) });
}
