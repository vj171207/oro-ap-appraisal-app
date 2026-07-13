// js/interviewRecordView.js
// Renders one interview record's expanded detail panel — extracted from
// interview-city.js (the per-city dashboard was first to build this) so
// interview-search.js can show the exact same detail view when a search
// result is expanded, rather than a second copy that could quietly drift.

export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/** DD/MM/YY, for compact collapsed rows. */
export function formatDateShort(isoYmd) {
  if (!isoYmd) return "";
  const parts = String(isoYmd).split("-");
  if (parts.length !== 3) return "";
  const [y, m, day] = parts;
  return `${day}/${m}/${y.slice(-2)}`;
}

export function buildDetailHtml(d) {
  return `
    <div class="detail-grid">
      <div><span class="detail-label">Company</span>${escapeHtml(d.company || "—")}</div>
      <div><span class="detail-label">Role</span>${escapeHtml(d.role || "—")}</div>
      <div><span class="detail-label">Age</span>${d.age ?? "—"}</div>
      <div><span class="detail-label">Experience</span>${escapeHtml(d.experience || "—")}</div>
      <div><span class="detail-label">Bike / DL-LLR</span>${escapeHtml(d.bikeAvailable || "—")} / ${escapeHtml(d.dlAvailable || "—")}</div>
      <div><span class="detail-label">Theory / Practical</span>${d.scoreTheory ?? "—"} / ${d.scorePractical ?? "—"}</div>
      <div><span class="detail-label">Total Score</span>${d.totalScore ?? "—"}</div>
      <div><span class="detail-label">${escapeHtml(d.localLanguage || "Local Language")} Proficiency</span>${escapeHtml(d.localLanguageProficiency || "—")}</div>
      <div><span class="detail-label">English Proficiency</span>${escapeHtml(d.englishProficiency || "—")}</div>
      <div><span class="detail-label">Interviewer</span>${escapeHtml(d.interviewer || "—")}</div>
    </div>
    <div class="remarks-block"><span class="detail-label">Round 1 Decision</span>${escapeHtml(d.round1Decision || "—")}</div>
    ${d.remarks ? `<div class="remarks-block"><span class="detail-label">Detailed Remarks</span>${escapeHtml(d.remarks)}</div>` : ""}
  `;
}
