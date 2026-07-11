// Shared helpers for the AP Interview dashboards (interview.js overall page,
// interview-city.js per-city page). Kept separate from exportExcel.js, which
// is calibration-specific (needle columns, Pass/Fail result field, testDate
// field name) — interview_entries has a different shape.

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

/** Filters records whose interviewDate falls within [fromStr, toStr] (inclusive). Empty string on either side means unbounded on that side. */
export function filterByDateWindow(records, fromStr, toStr) {
  return records.filter((r) => {
    if (!r.interviewDate) return false;
    if (fromStr && r.interviewDate < fromStr) return false;
    if (toStr && r.interviewDate > toStr) return false;
    return true;
  });
}

/**
 * Round 1 Decision is free text (e.g. "Selected", "Rejected due to lack of
 * appraisal knowledge", "Not Selected"), not a fixed dropdown — so this is a
 * best-effort text classifier, not an exact field read. "Not selected" is
 * checked before the generic "select" match so it correctly lands as
 * Rejected rather than Selected. Anything that matches neither pattern
 * (blank, or an unusual phrasing) falls into "Other" rather than being
 * guessed at.
 */
export function classifyDecision(decisionText) {
  const text = (decisionText || "").toLowerCase();
  if (!text.trim()) return "Other";
  if (text.includes("not selected") || text.includes("reject")) return "Rejected";
  if (text.includes("select")) return "Selected";
  return "Other";
}

/** {total, selected, rejected, other, selectionRate} — selectionRate is a % string or "—" when total is 0. */
export function computeDecisionStats(records) {
  const total = records.length;
  let selected = 0, rejected = 0, other = 0;

  records.forEach((r) => {
    const outcome = classifyDecision(r.round1Decision);
    if (outcome === "Selected") selected++;
    else if (outcome === "Rejected") rejected++;
    else other++;
  });

  const selectionRate = total > 0 ? ((selected / total) * 100).toFixed(1) : "—";
  return { total, selected, rejected, other, selectionRate };
}
