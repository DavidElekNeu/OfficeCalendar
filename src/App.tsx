import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  addMonths,
  format,
  isSameMonth,
  parseISO,
} from "date-fns";
import { getMonthCalendarDays, monthKey } from "./solver/calendar";
import { ruleShortLabel, statusLabel } from "./solver/rules";
import { solveSchedule } from "./solver/solver";
import type { DayStatus, PlannerPreferences, PlannerScenario, Rule, SolverResult } from "./solver/types";
import { createDefaultRules, createRuleId, createScenarioId, loadPlannerState, savePlannerState, type PlannerState } from "./lib/storage";
import { localeForLanguage, t, weekdayNames as getWeekdayNames, weekdayShortNames, type Language } from "./i18n";
import { StatusIcon } from "./components/StatusIcon";

const today = new Date();
const defaultMonth = monthKey(today);

function makeInitialState(): PlannerState {
  const scenario: PlannerScenario = {
    id: "scenario-main",
    name: "Havi terv",
    month: defaultMonth,
    rules: createDefaultRules(),
    publicHolidays: [],
    vacation: [],
    manualOfficeDays: [],
    manualHomeOfficeDays: [],
  };
  return { scenarios: [scenario], preferences: { attendanceTarget: 50, activeScenarioId: scenario.id, language: "hu", darkMode: false } };
}

export default function App() {
  const [state, setState] = useState<PlannerState>(() => loadPlannerState(makeInitialState()));
  const scenario = state.scenarios.find((item) => item.id === state.preferences.activeScenarioId) ?? state.scenarios[0];
  const language = state.preferences.language;
  const month = parseISO(`${scenario.month}-01`);
  const [selectedSchedule, setSelectedSchedule] = useState(0);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const result = useMemo(() => solveSchedule({
    month,
    rules: scenario.rules,
    publicHolidays: scenario.publicHolidays,
    vacation: scenario.vacation,
    manualOfficeDays: scenario.manualOfficeDays,
    manualHomeOfficeDays: scenario.manualHomeOfficeDays,
    language,
    maxSchedules: 5,
  }), [month.getTime(), scenario.rules, scenario.publicHolidays, scenario.vacation, scenario.manualOfficeDays, scenario.manualHomeOfficeDays]);
  const activeSchedule = result.schedules[Math.min(selectedSchedule, Math.max(0, result.schedules.length - 1))];

  useEffect(() => { savePlannerState(state); }, [state]);
  useEffect(() => {
    setSelectedSchedule(0);
    setSelectedDateKey(null);
  }, [scenario.id, scenario.month, scenario.rules, scenario.publicHolidays, scenario.vacation, scenario.manualOfficeDays, scenario.manualHomeOfficeDays]);

  const updateScenario = (updates: Partial<PlannerScenario>) => {
    setState((current) => ({
      ...current,
      scenarios: current.scenarios.map((item) => item.id === scenario.id ? { ...item, ...updates } : item),
    }));
  };

  const updatePreferences = (updates: Partial<PlannerPreferences>) => {
    setState((current) => ({ ...current, preferences: { ...current.preferences, ...updates } }));
  };

  const newScenario = () => {
    const next: PlannerScenario = { id: createScenarioId(), name: `${language === "hu" ? "Terv" : "Plan"} ${state.scenarios.length + 1}`, month: scenario.month, rules: createDefaultRules(), publicHolidays: [], vacation: [], manualOfficeDays: [], manualHomeOfficeDays: [] };
    setState((current) => ({ ...current, scenarios: [...current.scenarios, next], preferences: { ...current.preferences, activeScenarioId: next.id } }));
  };

  const deleteScenario = (scenarioId: string) => {
    if (state.scenarios.length === 1) return;
    if (!window.confirm(t(language, "deleteScenarioConfirm"))) return;
    setState((current) => {
      const deletedIndex = current.scenarios.findIndex((item) => item.id === scenarioId);
      const remaining = current.scenarios.filter((item) => item.id !== scenarioId);
      const activeScenarioId = current.preferences.activeScenarioId === scenarioId
        ? remaining[Math.min(deletedIndex, remaining.length - 1)].id
        : current.preferences.activeScenarioId;
      return { ...current, scenarios: remaining, preferences: { ...current.preferences, activeScenarioId } };
    });
  };

  const moveMonth = (amount: number) => updateScenario({ month: monthKey(addMonths(month, amount)) });

  const markManualAttendance = (dateKey: string, status: "OFFICE" | "HOME_OFFICE") => {
    if (scenario.publicHolidays.includes(dateKey) || scenario.vacation.includes(dateKey)) return;
    setSelectedDateKey(dateKey);
    setState((current) => ({
      ...current,
      scenarios: current.scenarios.map((item) => {
        if (item.id !== scenario.id) return item;
        const currentDates = status === "OFFICE" ? item.manualOfficeDays : item.manualHomeOfficeDays;
        const nextDates = currentDates.includes(dateKey) ? currentDates.filter((value) => value !== dateKey) : [...currentDates, dateKey].sort();
        return {
          ...item,
          manualOfficeDays: status === "OFFICE" ? nextDates : item.manualOfficeDays.filter((value) => value !== dateKey),
          manualHomeOfficeDays: status === "HOME_OFFICE" ? nextDates : item.manualHomeOfficeDays.filter((value) => value !== dateKey),
        };
      }),
    }));
  };

  const toggleVacation = (dateKey: string) => {
    if (scenario.publicHolidays.includes(dateKey)) return;
    setSelectedDateKey(dateKey);
    setState((current) => ({
      ...current,
      scenarios: current.scenarios.map((item) => {
        if (item.id !== scenario.id) return item;
        const nextVacation = item.vacation.includes(dateKey)
          ? item.vacation.filter((value) => value !== dateKey)
          : [...item.vacation, dateKey].sort();
        return {
          ...item,
          vacation: nextVacation,
          manualOfficeDays: item.manualOfficeDays.filter((value) => value !== dateKey),
          manualHomeOfficeDays: item.manualHomeOfficeDays.filter((value) => value !== dateKey),
        };
      }),
    }));
  };

  return (
    <div className={`app-shell min-h-screen text-ink ${state.preferences.darkMode ? "theme-dark" : ""}`}>
      <aside className="sidebar flex flex-col">
        <div className="brand-lockup">
          <div className="brand-mark">H</div>
          <div>
            <div className="brand-name">Hybrid</div>
            <div className="brand-subtitle">Office Planner</div>
          </div>
        </div>

        <div className="scenario-list">
          {state.scenarios.map((item) => (
            <div key={item.id} className={`scenario-row ${item.id === scenario.id ? "is-active" : ""}`}>
              <button className="scenario-item" onClick={() => updatePreferences({ activeScenarioId: item.id })}>
                <span className="scenario-dot" />
                <span className="truncate text-left">{item.name}</span>
                <span className="scenario-month">{format(parseISO(`${item.month}-01`), "MMM yy", { locale: localeForLanguage(language) })}</span>
              </button>
              {state.scenarios.length > 1 && <button className="scenario-delete" onClick={(event) => { event.stopPropagation(); deleteScenario(item.id); }} aria-label={`${t(language, "deleteScenario")}: ${item.name}`} title={t(language, "deleteScenario")}>×</button>}
            </div>
          ))}
        </div>
        <button className="new-scenario" onClick={newScenario}><span>＋</span> {t(language, "newScenario")}</button>

        <div className="sidebar-footer mt-auto">
          <div className="saved-state"><span className="saved-dot" /> {t(language, "savedLocally")}</div>
          <div className="sidebar-note">{t(language, "localStorageNote")}</div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <div className="eyebrow">{t(language, "monthlyWorkspace")}</div>
            <input className="scenario-title-input" value={scenario.name} onChange={(event) => updateScenario({ name: event.target.value || "Untitled plan" })} aria-label="Scenario name" />
          </div>
          <div className="topbar-actions">
            <label className="language-control theme-control"><span>{t(language, "theme")}</span><select value={state.preferences.darkMode ? "dark" : "light"} onChange={(event) => updatePreferences({ darkMode: event.target.value === "dark" })}><option value="light">{t(language, "lightMode")}</option><option value="dark">{t(language, "darkMode")}</option></select></label>
            <label className="language-control"><span>{t(language, "language")}</span><select value={language} onChange={(event) => updatePreferences({ language: event.target.value as Language })}><option value="hu">{t(language, "hungarian")}</option><option value="en">{t(language, "english")}</option></select></label>
          </div>
        </header>

        <section className="control-strip">
          <div className="month-control">
            <button className="month-arrow" onClick={() => moveMonth(-1)} aria-label="Previous month">←</button>
            <div className="month-display"><span className="calendar-glyph">▣</span><span>{format(month, "MMMM yyyy", { locale: localeForLanguage(language) })}</span></div>
            <button className="month-arrow" onClick={() => moveMonth(1)} aria-label="Next month">→</button>
          </div>
        </section>

        <div className="content-grid">
          <div className="primary-column">
            <Summary language={language} result={result} target={state.preferences.attendanceTarget} onTargetChange={(target) => updatePreferences({ attendanceTarget: target })} />
            <CalendarCard language={language} month={month} scenario={scenario} result={result} activeSchedule={activeSchedule} selectedDateKey={selectedDateKey} onMarkOffice={(dateKey) => markManualAttendance(dateKey, "OFFICE")} onMarkHomeOffice={(dateKey) => markManualAttendance(dateKey, "HOME_OFFICE")} onToggleVacation={toggleVacation} />
            {activeSchedule && <ScheduleDetails language={language} schedule={activeSchedule} />}
          </div>
          <div className="secondary-column">
            <RulePanel language={language} month={scenario.month} rules={scenario.rules} onChange={(rules) => updateScenario({ rules })} />
            <ExceptionsPanel language={language} scenario={scenario} onChange={updateScenario} />
            {result.status === "OPTIMAL" && result.schedules.length > 1 && <SchedulePicker language={language} result={result} selected={selectedSchedule} onChange={setSelectedSchedule} />}
            <SolverNote language={language} result={result} />
          </div>
        </div>
        <footer className="page-footer"><span>{t(language, "footerName")}</span><span>{t(language, "footerTagline")}</span></footer>
      </main>
    </div>
  );
}

function Summary({ language, result, target, onTargetChange }: { language: Language; result: SolverResult; target: number; onTargetChange: (target: number) => void }) {
  const officeDays = result.bestOfficeDays ?? 0;
  const denominator = result.eligibleDays.length;
  const requiredOfficeDays = Math.ceil((denominator * target) / 100);
  const attendanceMet = result.officePercentage !== null && result.officePercentage >= target;
  const missingOfficeDays = Math.max(0, requiredOfficeDays - officeDays);
  const progress = Math.min(100, Math.max(0, result.officePercentage ?? 0));
  return (
    <section className={`summary-card ${result.status === "NO_VALID_SCHEDULE" ? "summary-danger" : attendanceMet ? "summary-success" : "summary-warning"}`}>
      <div className="summary-main">
        <div className="summary-kicker">{result.status === "NO_VALID_SCHEDULE" ? t(language, "planningBlocked") : attendanceMet ? t(language, "optimalSchedule") : t(language, "minimumRequired")}</div>
        <div className="summary-metrics">
          <div className="summary-title">{result.status === "NO_VALID_SCHEDULE" ? t(language, "noValidSchedule") : `${officeDays} / ${denominator} ${t(language, "officeDays")}`}</div>
          {result.status !== "NO_VALID_SCHEDULE" && <div className="summary-percentage">{result.officePercentage?.toFixed(1)}%</div>}
        </div>
        {result.status !== "NO_VALID_SCHEDULE" && <div className="summary-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={t(language, "officeDays")}><div style={{ width: `${progress}%` }} /></div>}
        {result.status === "NO_VALID_SCHEDULE" ? (
          <p className="summary-copy">{t(language, "rulesContradict")}</p>
        ) : (
          <p className="summary-copy">{attendanceMet ? t(language, "requiredAttendanceMet") : t(language, "requiredAttendanceMissing", { days: missingOfficeDays, dayLabel: language === "hu" ? "napot" : missingOfficeDays === 1 ? "day" : "days" })}</p>
        )}
        <label className="summary-target-control"><span>{t(language, "attendanceTarget")}</span><input className="target-slider" type="range" min="0" max="100" step="5" value={target} onChange={(event) => onTargetChange(Number(event.target.value))} style={{ "--range-progress": `${target}%` } as CSSProperties} /><strong>{target}%</strong></label>
      </div>
      <div className="summary-orb">{result.status === "NO_VALID_SCHEDULE" ? "!" : attendanceMet ? "✓" : "↗"}</div>
    </section>
  );
}

function CalendarCard({ language, month, scenario, result, activeSchedule, selectedDateKey, onMarkOffice, onMarkHomeOffice, onToggleVacation }: { language: Language; month: Date; scenario: PlannerScenario; result: SolverResult; activeSchedule?: SolverResult["schedules"][number]; selectedDateKey: string | null; onMarkOffice: (dateKey: string) => void; onMarkHomeOffice: (dateKey: string) => void; onToggleVacation: (dateKey: string) => void }) {
  const calendarDays = getMonthCalendarDays(month);
  const byDate = new Map(activeSchedule?.days.map((day) => [day.dateKey, day]) ?? []);
  const eligibleByDate = new Map(result.eligibleDays.map((day) => [day.dateKey, day]));
  const holidaySet = new Set(scenario.publicHolidays);
  const vacationSet = new Set(scenario.vacation);
  return (
    <section className="panel calendar-panel">
      <div className="panel-heading calendar-heading">
        <div><div className="panel-kicker">{t(language, "attendanceMap")}</div><h2>{format(month, "MMMM", { locale: localeForLanguage(language) })} {t(language, "overview")}</h2></div>
        <div className="legend"><span><i className="legend-swatch office-swatch" /> {t(language, "office")}</span><span><i className="legend-swatch home-swatch" /> {t(language, "homeOffice")}</span><span><i className="legend-swatch excluded-swatch" /> {t(language, "excluded")}</span></div>
      </div>
      <div className="calendar-grid calendar-weekdays">{weekdayShortNames(language).slice(1).concat(weekdayShortNames(language).slice(0, 1)).map((name) => <div key={name}>{name}</div>)}</div>
      <div className="calendar-grid calendar-days">
        {calendarDays.map((date) => {
          const key = format(date, "yyyy-MM-dd");
          const scheduleDay = byDate.get(key);
          const eligibleDay = eligibleByDate.get(key);
          const inMonth = isSameMonth(date, month);
          const excluded = holidaySet.has(key) || vacationSet.has(key);
          const manualOffice = scenario.manualOfficeDays.includes(key);
          const manualHomeOffice = scenario.manualHomeOfficeDays.includes(key);
          const status = scheduleDay?.status ?? (manualOffice ? "OFFICE" : manualHomeOffice ? "HOME_OFFICE" : undefined);
          const statusClass = status === "OFFICE" ? "day-office" : status === "HOME_OFFICE" ? "day-home" : excluded ? "day-excluded" : "";
          const statusTitle = scheduleDay ? `${statusLabel(scheduleDay.status, language)}\n\n${language === "hu" ? "Indoklás" : "Reasons"}:\n${scheduleDay.reasons.map((reason) => `• ${reason}`).join("\n")}` : manualOffice ? (language === "hu" ? "Az irodában voltam (manuális felülírás)" : "I was in Office (manual override)") : manualHomeOffice ? (language === "hu" ? "Nem lehetek az irodában (manuális felülírás)" : "I can't be in Office (manual override)") : (language === "hu" ? "Elszámolható munkanap" : "Eligible working day");
          return (
            <button key={key} className={`calendar-day ${!inMonth ? "day-outside" : ""} ${date.getDay() === 0 || date.getDay() === 6 ? "day-weekend" : ""} ${statusClass} ${manualOffice ? "day-manual-office" : ""} ${manualHomeOffice ? "day-manual-home" : ""} ${selectedDateKey === key ? "day-selected" : ""}`} onClick={() => eligibleDay && onMarkHomeOffice(key)} onMouseDown={(event) => { if (event.button === 1 && inMonth && !holidaySet.has(key) && (eligibleDay || vacationSet.has(key))) { event.preventDefault(); onToggleVacation(key); } }} onAuxClick={(event) => { if (event.button === 1) event.preventDefault(); }} onContextMenu={(event) => { if (eligibleDay) { event.preventDefault(); onMarkOffice(key); } }} disabled={!eligibleDay && !vacationSet.has(key)} title={`${format(date, "EEEE, MMMM d")} — ${excluded ? (holidaySet.has(key) ? "Excluded" : "Vacation") : statusTitle}${eligibleDay ? `\n\nLeft click: I can't be in Office\nRight click: I was in Office\n${t(language, "middleClickHint")}` : vacationSet.has(key) ? `\n\n${t(language, "middleClickHint")}` : ""}`}>
              <span className="day-number">{format(date, "d")}</span>
              {inMonth && eligibleDay && status && <span className="day-status"><StatusIcon type={status === "OFFICE" ? "office" : "home"} /><span className="status-text">{status === "OFFICE" ? t(language, "officeShort") : t(language, "homeShort")}</span></span>}
              {inMonth && eligibleDay && !status && <span className="day-status day-unplanned"><StatusIcon type="eligible" /><span className="status-text">{language === "hu" ? "MUNKANAP" : "ELIGIBLE"}</span></span>}
              {inMonth && excluded && !eligibleDay && <span className="day-status excluded-label"><StatusIcon type={holidaySet.has(key) ? "holiday" : "vacation"} /><span className="status-text">{holidaySet.has(key) ? t(language, "excludedHoliday") : t(language, "excludedVacation")}</span></span>}
            </button>
          );
        })}
      </div>
      {result.status === "NO_VALID_SCHEDULE" ? <ConflictCallout language={language} conflicts={result.conflicts} /> : <div className="calendar-caption"><span><b>{result.eligibleDays.length}</b> {t(language, "eligibleWorkingDays")}</span><span>{t(language, "leftClickHint")}</span><span>{t(language, "rightClickHint")}</span></div>}
    </section>
  );
}

function ScheduleDetails({ language, schedule }: { language: Language; schedule: NonNullable<SolverResult["schedules"][number]> }) {
  const officeDays = schedule.days.filter((day) => day.status === "OFFICE");
  return (
    <section className="panel reasons-panel">
      <div className="panel-heading"><div><div className="panel-kicker">{t(language, "whyOffice")}</div><h2>{t(language, "selectedOfficeDays")}</h2></div><span className="count-pill">{officeDays.length} {t(language, "days")}</span></div>
      <div className="reason-list">
        {officeDays.map((day) => <div className="reason-row" key={day.dateKey}><div className="reason-date"><span className="reason-day">{format(day.date, "EEE", { locale: localeForLanguage(language) })}</span><span>{format(day.date, "MMM d", { locale: localeForLanguage(language) })}</span></div><div className="reason-copy"><strong>{t(language, "office")}</strong><span>{day.reasons[0]}</span></div></div>)}
      </div>
    </section>
  );
}

function RulePanel({ language, month, rules, onChange }: { language: Language; month: string; rules: Rule[]; onChange: (rules: Rule[]) => void }) {
  const [adding, setAdding] = useState<Rule["type"] | "">("");
  const [collapsed, setCollapsed] = useState(false);
  const addRule = () => {
    if (!adding) return;
    onChange([...rules, makeRule(adding, month)]);
    setAdding("");
  };
  const updateRule = (id: string, updates: Partial<Rule>) => onChange(rules.map((rule) => rule.id === id ? { ...rule, ...updates } as Rule : rule));
  const removeRule = (id: string) => onChange(rules.filter((rule) => rule.id !== id));
  return (
    <section className="panel rules-panel">
      <div className="panel-heading"><div><div className="panel-kicker">{t(language, "constraints")}</div><h2>{t(language, "rules")}</h2></div><div className="panel-heading-actions"><span className="count-pill">{rules.filter((rule) => rule.enabled).length} {t(language, "active")}</span><button className="panel-collapse-toggle" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed} aria-label={t(language, collapsed ? "expandRules" : "collapseRules")} title={t(language, collapsed ? "expandRules" : "collapseRules")}>{collapsed ? "＋" : "−"}</button></div></div>
      {!collapsed && <>
        <div className="rule-list">
          {rules.map((rule) => <RuleRow key={rule.id} language={language} rule={rule} onChange={(updates) => updateRule(rule.id, updates)} onRemove={() => removeRule(rule.id)} />)}
        </div>
        <div className="add-rule-row"><select value={adding} onChange={(event) => setAdding(event.target.value as Rule["type"] | "")} aria-label={t(language, "addRule")}><option value="">{t(language, "addRule")}</option><option value="MANDATORY_WEEKDAY">{t(language, "mandatoryWeekday")}</option><option value="FORBIDDEN_WEEKDAY">{t(language, "forbiddenWeekday")}</option><option value="SPECIFIC_DATE">{t(language, "specificDate")}</option><option value="NTH_WEEK_WEEKDAY">{t(language, "nthWeekWeekday")}</option><option value="MIN_OFFICE_DAYS_WEEK">{t(language, "minimumOfficeDaysWeek")}</option><option value="MAX_OFFICE_DAYS_WEEK">{t(language, "maximumOfficeDaysWeek")}</option><option value="MAX_HOME_OFFICE_DAYS_WEEK">{t(language, "maximumHomeOfficeDaysWeek")}</option><option value="MAX_HOME_OFFICE_ON_WEEKDAY">{t(language, "maximumHomeOfficeOnWeekday")}</option><option value="NOT_BOTH_HOME_OFFICE">{t(language, "notBothHomeOffice")}</option><option value="MAX_CONSECUTIVE_HOME_OFFICE">{t(language, "maxConsecutiveHomeOffice")}</option></select><button className="add-button" onClick={addRule} disabled={!adding}>{t(language, "add")}</button></div>
      </>}
    </section>
  );
}

function RuleRow({ language, rule, onChange, onRemove }: { language: Language; rule: Rule; onChange: (updates: Partial<Rule>) => void; onRemove: () => void }) {
  return (
    <div className={`rule-row ${rule.enabled ? "" : "rule-disabled"}`}>
      <button className={`toggle ${rule.enabled ? "toggle-on" : ""}`} onClick={() => onChange({ enabled: !rule.enabled })} aria-label={language === "hu" ? (rule.enabled ? "Szabály kikapcsolása" : "Szabály bekapcsolása") : `${rule.enabled ? "Disable" : "Enable"} rule`}>{rule.enabled ? "✓" : ""}</button>
      <div className="rule-body">
        <div className="rule-label">{ruleShortLabel(rule, language)}</div>
        <div className="rule-controls">
          {rule.type === "MANDATORY_WEEKDAY" && <><select value={rule.weekday} onChange={(event) => onChange({ weekday: Number(event.target.value) })}>{weekdayOptions(language)}</select><StatusSelect language={language} value={rule.status} onChange={(status) => onChange({ status })} /></>}
          {rule.type === "FORBIDDEN_WEEKDAY" && <><select value={rule.weekday} onChange={(event) => onChange({ weekday: Number(event.target.value) })}>{weekdayOptions(language)}</select><span className="rule-inline-text">{t(language, "cannotBe")}</span><StatusSelect language={language} value={rule.status} onChange={(status) => onChange({ status })} /></>}
          {rule.type === "SPECIFIC_DATE" && <><input type="date" value={rule.date} onChange={(event) => onChange({ date: event.target.value })} /><StatusSelect language={language} value={rule.status} onChange={(status) => onChange({ status })} /></>}
          {rule.type === "NTH_WEEK_WEEKDAY" && <><select value={rule.week} onChange={(event) => onChange({ week: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{language === "hu" ? `${value}. hét` : `${value}${value === 1 ? "st" : value === 2 ? "nd" : value === 3 ? "rd" : "th"} week`}</option>)}</select><select value={rule.weekday} onChange={(event) => onChange({ weekday: Number(event.target.value) })}>{weekdayOptions(language)}</select><StatusSelect language={language} value={rule.status} onChange={(status) => onChange({ status })} /></>}
          {rule.type === "MIN_OFFICE_DAYS_WEEK" && <NumberStepper value={rule.minimum} onChange={(value) => onChange({ minimum: value })} suffix={t(language, "officeDaysPerWeek")} />}
          {rule.type === "MAX_OFFICE_DAYS_WEEK" && <NumberStepper value={rule.maximum} onChange={(value) => onChange({ maximum: value })} suffix={t(language, "officeDaysPerWeek")} />}
          {rule.type === "MAX_HOME_OFFICE_DAYS_WEEK" && <NumberStepper value={rule.maximum} onChange={(value) => onChange({ maximum: value })} suffix={t(language, "homeOfficeDaysPerWeek")} />}
          {rule.type === "MAX_HOME_OFFICE_ON_WEEKDAY" && <><select value={rule.weekday} onChange={(event) => onChange({ weekday: Number(event.target.value) })}>{weekdayOptions(language)}</select><NumberStepper value={rule.maximum} limit={6} onChange={(value) => onChange({ maximum: value })} suffix={t(language, "homeOfficeDaysPerMonth")} /></>}
          {rule.type === "NOT_BOTH_HOME_OFFICE" && <><select value={rule.weekdays[0]} onChange={(event) => onChange({ weekdays: [Number(event.target.value), rule.weekdays[1]] })}>{weekdayOptions(language)}</select><span className="rule-inline-text">{language === "hu" ? "és" : "and"}</span><select value={rule.weekdays[1]} onChange={(event) => onChange({ weekdays: [rule.weekdays[0], Number(event.target.value)] })}>{weekdayOptions(language)}</select></>}
          {rule.type === "MAX_CONSECUTIVE_HOME_OFFICE" && <NumberStepper value={rule.maximum} limit={31} onChange={(value) => onChange({ maximum: value })} suffix={t(language, "consecutiveHomeDays")} />}
        </div>
      </div>
      <button className="remove-rule" onClick={onRemove} aria-label={language === "hu" ? "Szabály törlése" : "Remove rule"}>×</button>
    </div>
  );
}

function ExceptionsPanel({ language, scenario, onChange }: { language: Language; scenario: PlannerScenario; onChange: (updates: Partial<PlannerScenario>) => void }) {
  const [kind, setKind] = useState<"publicHolidays" | "vacation">("publicHolidays");
  const [date, setDate] = useState("");
  const add = () => {
    if (!date || scenario[kind].includes(date)) return;
    onChange({ [kind]: [...scenario[kind], date] });
    setDate("");
  };
  const remove = (key: "publicHolidays" | "vacation", value: string) => onChange({ [key]: scenario[key].filter((item) => item !== value) });
  return (
    <section className="panel exceptions-panel"><div className="panel-heading"><div><div className="panel-kicker">{t(language, "calendarExceptions")}</div><h2>{t(language, "holidaysVacation")}</h2></div></div><div className="exception-add"><select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="publicHolidays">{t(language, "publicHoliday")}</option><option value="vacation">{t(language, "vacationDay")}</option></select><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /><button className="add-button" onClick={add} disabled={!date}>{t(language, "add")}</button></div><div className="exception-list">{(["publicHolidays", "vacation"] as const).flatMap((key) => scenario[key].map((value) => <div className="exception-chip" key={`${key}-${value}`}><span className={`exception-dot ${key === "vacation" ? "vacation-dot" : ""}`} />{format(parseISO(value), "MMM d", { locale: localeForLanguage(language) })}<span className="exception-type">{key === "vacation" ? t(language, "vacation") : t(language, "holiday")}</span><button onClick={() => remove(key, value)} aria-label={`${language === "hu" ? "Törlés" : "Remove"} ${value}`}>×</button></div>))}</div></section>
  );
}

function SchedulePicker({ language, result, selected, onChange }: { language: Language; result: SolverResult; selected: number; onChange: (value: number) => void }) {
  return <div className="schedule-picker"><span className="picker-label">{t(language, "equalBestSchedules")}</span>{result.schedules.map((_, index) => <button key={index} className={selected === index ? "picker-active" : ""} onClick={() => onChange(index)}>{t(language, "option")} {index + 1}</button>)}</div>;
}

function SolverNote({ language, result }: { language: Language; result: SolverResult }) {
  const suffix = result.schedules.length === 1 ? "" : "s";
  return <div className="solver-note"><span className="note-icon">✦</span><div><strong>{t(language, "solverNote")}</strong><p>{result.status === "OPTIMAL" ? t(language, "searched", { count: result.stats.nodesVisited.toLocaleString(), schedules: result.schedules.length, s: suffix }) : t(language, "tryDisabling")}</p></div></div>;
}

function ConflictCallout({ language, conflicts }: { language: Language; conflicts: SolverResult["conflicts"] }) {
  return <div className="conflict-callout"><strong>{t(language, "likelyConflicts")}</strong>{conflicts.slice(0, 3).map((conflict) => <div key={conflict.message} className="conflict-item"><span>•</span><span>{conflict.message}</span></div>)}</div>;
}

function NumberStepper({ value, limit = 7, onChange, suffix }: { value: number; limit?: number; onChange: (value: number) => void; suffix: string }) {
  return <div className="number-stepper"><button onClick={() => onChange(Math.max(0, value - 1))}>−</button><span>{value}</span><button onClick={() => onChange(Math.min(limit, value + 1))}>＋</button><span className="stepper-suffix">{suffix}</span></div>;
}

function StatusSelect({ language, value, onChange }: { language: Language; value: DayStatus; onChange: (value: DayStatus) => void }) {
  return <select value={value} onChange={(event) => onChange(event.target.value as DayStatus)}><option value="OFFICE">{t(language, "statusOffice")}</option><option value="HOME_OFFICE">{t(language, "statusHomeOffice")}</option></select>;
}

function weekdayOptions(language: Language = "en") {
  return getWeekdayNames(language).map((name, value) => <option key={name} value={value}>{name}</option>);
}

function makeRule(type: Rule["type"], month = defaultMonth): Rule {
  const id = createRuleId();
  switch (type) {
    case "MANDATORY_WEEKDAY": return { id, enabled: true, type, weekday: 2, status: "OFFICE" };
    case "FORBIDDEN_WEEKDAY": return { id, enabled: true, type, weekday: 3, status: "OFFICE" };
    case "SPECIFIC_DATE": return { id, enabled: true, type, date: month + "-01", status: "OFFICE" };
    case "NTH_WEEK_WEEKDAY": return { id, enabled: true, type, week: 3, weekday: 4, status: "OFFICE" };
    case "MIN_OFFICE_DAYS_WEEK": return { id, enabled: true, type, minimum: 2 };
    case "MAX_OFFICE_DAYS_WEEK": return { id, enabled: true, type, maximum: 3 };
    case "MAX_HOME_OFFICE_DAYS_WEEK": return { id, enabled: true, type, maximum: 3 };
    case "MAX_HOME_OFFICE_ON_WEEKDAY": return { id, enabled: true, type, weekday: 1, maximum: 2 };
    case "NOT_BOTH_HOME_OFFICE": return { id, enabled: true, type, weekdays: [1, 5] };
    case "MAX_CONSECUTIVE_HOME_OFFICE": return { id, enabled: true, type, maximum: 3 };
  }
}
