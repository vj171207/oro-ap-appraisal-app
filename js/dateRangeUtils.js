// Shared date-range utilities — used by both AP Calibration's date filters
// (exportExcel.js) and AP Interview's (interviewStats.js). These two pieces
// of logic are genuinely identical between the two apps (pure date math,
// no dependency on either app's record shape) and were previously defined
// twice, verbatim, once in each file — a maintainability risk, since any
// future fix to one copy could easily be forgotten in the other.
//
// filterByDateField is NOT the same as the old filterByDateWindow in either
// file — those two were NOT actually identical to each other, despite
// having the same name: exportExcel.js's filtered on `testDate`,
// interviewStats.js's on `interviewDate`. This takes the field name as a
// parameter instead, and each app's own file wraps it with its own field
// name baked in — see the bottom of exportExcel.js / interviewStats.js.

export const QUICK_RANGE_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "last3", label: "Last 3 months" },
];

/** Returns {from, to} as "YYYY-MM-DD" strings for a quick-range key, or {from:"", to:""} for "all" (unbounded). */
export function getQuickRangeDates(rangeKey, now = new Date()) {
  const toIso = (d) => d.toISOString().slice(0, 10);

  if (rangeKey === "last3") {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 3);
    return { from: toIso(start), to: toIso(now) };
  }
  return { from: "", to: "" };
}

/** Filters records whose [fieldName] falls within [fromStr, toStr] (inclusive). Empty string on either side means unbounded on that side. Assumes fieldName's value and fromStr/toStr are all "YYYY-MM-DD", so plain string comparison is correct. */
export function filterByDateField(records, fieldName, fromStr, toStr) {
  return records.filter((r) => {
    const value = r[fieldName];
    if (!value) return false;
    if (fromStr && value < fromStr) return false;
    if (toStr && value > toStr) return false;
    return true;
  });
}

/** Human-readable description of a From/To window, for a report's subtitle — e.g. "All time", "2026-01-01 to 2026-03-31", "From 2026-01-01", "Up to 2026-03-31". Previously defined identically in city.js, interview-city.js, reports.js, and interview-reports.js. */
export function describeRange(from, to) {
  if (!from && !to) return "All time";
  if (from && to) return `${from} to ${to}`;
  if (from) return `From ${from}`;
  return `Up to ${to}`;
}
