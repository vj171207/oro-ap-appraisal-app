// Shared helpers for the AP Interview dashboards (interview.js overall page,
// interview-city.js per-city page). Kept separate from exportExcel.js, which
// is calibration-specific (needle columns, Pass/Fail result field, testDate
// field name) — interview_entries has a different shape.

// QUICK_RANGE_OPTIONS/getQuickRangeDates are pure date math shared with AP
// Calibration's exportExcel.js — both re-export the same implementation
// from dateRangeUtils.js rather than each defining their own copy.
export { QUICK_RANGE_OPTIONS, getQuickRangeDates } from "./dateRangeUtils.js";
import { filterByDateField } from "./dateRangeUtils.js";

/** Filters records whose interviewDate falls within [fromStr, toStr] (inclusive). Empty string on either side means unbounded on that side. */
export function filterByDateWindow(records, fromStr, toStr) {
  return filterByDateField(records, "interviewDate", fromStr, toStr);
}

/**
 * Round 1 Decision is a Selected/Rejected dropdown on the entry form now —
 * but records saved before that existed have free-text values (e.g.
 * "Rejected due to lack of appraisal knowledge", "Not Selected"), so this
 * stays a best-effort text classifier rather than an exact field read, to
 * keep those older records correctly bucketed too. "Not selected" is
 * checked before the generic "select" match so it correctly lands as
 * Rejected rather than Selected. Anything that matches neither pattern
 * (blank, or an unusual phrasing) falls into "Other" rather than being
 * guessed at.
 *
 * "next level" / "ok for next level" is a second legacy phrasing, used for
 * selected candidates specifically in Bengaluru, Karimnagar, and Pune's
 * older records, before "Selected" itself was the standard wording. Checked
 * after the reject/select checks above (so a genuine rejection is never
 * misread), with a same-line negation guard ("not ok...") as a safety net,
 * even though no such record has actually been seen.
 */
export function classifyDecision(decisionText) {
  const text = (decisionText || "").toLowerCase();
  if (!text.trim()) return "Other";
  if (text.includes("not selected") || text.includes("reject")) return "Rejected";
  if (text.includes("select")) return "Selected";
  if (text.includes("next level") && !text.includes("not ok")) return "Selected";
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
