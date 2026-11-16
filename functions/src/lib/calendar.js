const { MARKET_TIMEZONE } = require("../config");

const DAY_MS = 86_400_000;
const MAJOR_FOOD_HOLIDAYS = new Set(["thanksgiving", "christmas", "easter", "july4", "superbowl"]);

/** Calendar date (y, m, d) in a timezone, as a UTC-midnight Date so day math is exact. */
function localDate(now = new Date(), timeZone = MARKET_TIMEZONE) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
}

function parseAsOf(asOf) {
  if (!asOf) return null;
  const match = String(asOf).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

/** nth weekday of a month (weekday 0=Sun). n = -1 means last. */
function nthWeekday(year, month, weekday, n) {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month, 1));
    const offset = (weekday - first.getUTCDay() + 7) % 7;
    return new Date(Date.UTC(year, month, 1 + offset + (n - 1) * 7));
  }
  const last = new Date(Date.UTC(year, month + 1, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return new Date(Date.UTC(year, month, last.getUTCDate() - offset));
}

/** Western Easter (Anonymous Gregorian algorithm). */
function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** Grocery-relevant US dates with how far ahead shoppers start buying. */
function holidaysForYear(year) {
  const fixed = (m, d) => new Date(Date.UTC(year, m, d));
  return [
    { key: "new_years", label: "New Year's Day", date: fixed(0, 1), leadDays: 5, tags: ["new_years"] },
    { key: "superbowl", label: "Super Bowl Sunday", date: nthWeekday(year, 1, 0, 2), leadDays: 10, tags: ["superbowl", "game_day"] },
    { key: "valentines", label: "Valentine's Day", date: fixed(1, 14), leadDays: 10, tags: ["valentines"] },
    { key: "st_patricks", label: "St. Patrick's Day", date: fixed(2, 17), leadDays: 7, tags: ["st_patricks"] },
    { key: "easter", label: "Easter", date: easter(year), leadDays: 14, tags: ["easter"] },
    { key: "cinco_de_mayo", label: "Cinco de Mayo", date: fixed(4, 5), leadDays: 7, tags: ["cinco_de_mayo", "hispanic_pantry"] },
    { key: "mothers_day", label: "Mother's Day", date: nthWeekday(year, 4, 0, 2), leadDays: 7, tags: ["baking", "breakfast"] },
    { key: "memorial_day", label: "Memorial Day", date: nthWeekday(year, 4, 1, -1), leadDays: 10, tags: ["memorial_day", "bbq"] },
    { key: "fathers_day", label: "Father's Day", date: nthWeekday(year, 5, 0, 3), leadDays: 7, tags: ["bbq"] },
    { key: "july4", label: "Fourth of July", date: fixed(6, 4), leadDays: 14, tags: ["july4", "bbq", "summer"] },
    { key: "labor_day", label: "Labor Day", date: nthWeekday(year, 8, 1, 1), leadDays: 10, tags: ["labor_day", "bbq"] },
    { key: "halloween", label: "Halloween", date: fixed(9, 31), leadDays: 21, tags: ["halloween"] },
    { key: "thanksgiving", label: "Thanksgiving", date: nthWeekday(year, 10, 4, 4), leadDays: 21, tags: ["thanksgiving", "baking"] },
    { key: "christmas", label: "Christmas", date: fixed(11, 25), leadDays: 30, tags: ["christmas", "baking"] },
    { key: "new_years_eve", label: "New Year's Eve", date: fixed(11, 31), leadDays: 7, tags: ["new_years"] },
  ];
}

function seasonFor(date) {
  const month = date.getUTCMonth();
  if (month >= 2 && month <= 4) return { key: "spring", label: "Spring produce", tags: ["spring", "produce_seasonal"] };
  if (month >= 5 && month <= 7) return { key: "summer", label: "Summer produce and grilling", tags: ["summer", "produce_seasonal", "bbq"] };
  if (month >= 8 && month <= 10) return { key: "fall", label: "Fall harvest", tags: ["fall", "produce_seasonal"] };
  return { key: "winter", label: "Winter comfort food", tags: ["winter"] };
}

/**
 * Pure calendar signals for a day (no network): upcoming holidays inside their buying window,
 * the season, and recurring windows like back-to-school, cold-and-flu, and hurricane season.
 */
function calendarSignals({ asOf, now = new Date(), timeZone = MARKET_TIMEZONE, seasonalRisks = [] } = {}) {
  const today = parseAsOf(asOf) || localDate(now, timeZone);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const day = today.getUTCDate();

  const holidays = [...holidaysForYear(year), ...holidaysForYear(year + 1)]
    .map((h) => ({ ...h, daysUntil: Math.round((h.date - today) / DAY_MS) }))
    .filter((h) => h.daysUntil >= 0 && h.daysUntil <= h.leadDays)
    .map((h) => ({
      kind: "holiday",
      key: h.key,
      label: h.label,
      date: ymd(h.date),
      daysUntil: h.daysUntil,
      tags: h.tags,
      // Stores pre-order for big food holidays across the whole lead window, not just the last week.
      severity: h.daysUntil <= 3 ? "high" : h.daysUntil <= 10 || MAJOR_FOOD_HOLIDAYS.has(h.key) ? "moderate" : "info",
    }));

  const season = seasonFor(today);
  const windows = [
    { kind: "season", key: season.key, label: season.label, tags: season.tags, severity: "info" },
  ];

  const backToSchool = (month === 6 && day >= 15) || (month === 7 && day <= 25);
  if (backToSchool) {
    windows.push({ kind: "window", key: "back_to_school", label: "Back to school", tags: ["back_to_school"], severity: "moderate" });
  }
  if (month >= 9 || month <= 2) {
    windows.push({ kind: "window", key: "cold_flu", label: "Cold and flu season", tags: ["cold_flu"], severity: "info" });
  }
  if (month >= 5 && month <= 7) {
    windows.push({ kind: "window", key: "heat", label: "Summer heat", tags: ["heat_wave"], severity: "info" });
  }
  if (seasonalRisks.includes("hurricane") && month >= 5 && month <= 10) {
    windows.push({ kind: "window", key: "hurricane_season", label: "Atlantic hurricane season", tags: ["storm"], severity: "info" });
  }

  const signals = [...holidays, ...windows];
  return {
    asOf: ymd(today),
    signals,
    keys: signals.map((s) => s.key).sort(),
    tags: [...new Set(signals.flatMap((s) => s.tags))],
  };
}

module.exports = { calendarSignals, holidaysForYear, localDate, parseAsOf, ymd };
