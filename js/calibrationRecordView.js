// js/calibrationRecordView.js
// Renders one calibration record's expanded detail panel — extracted from
// city.js (the per-city dashboard was first to build this) so search.js
// can show the exact same detail view when a search result is expanded,
// rather than a second copy of this markup that could quietly drift.
//
// Pure presentation: given a record object, returns an HTML string. No
// Firestore, no state, no DOM queries beyond the escapeHtml helper's own
// throwaway element.

export const KARAT_SHORT = {
  "22K": "22K", "21K": "21K", "20K": "20K", "19K": "19K", "18K": "18K", "Below 18K": "<18K",
};

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

/** "1 Jun 2026", for the expanded detail panel. */
export function formatDateLong(isoYmd) {
  if (!isoYmd) return "";
  const parts = String(isoYmd).split("-");
  if (parts.length !== 3) return isoYmd;
  const [y, m, day] = parts;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const mi = parseInt(m, 10) - 1;
  if (mi < 0 || mi > 11) return isoYmd;
  return `${day} ${months[mi]} ${y}`;
}

export function buildDetailHtml(d) {
  const needleRows = (d.needles || [])
    .map((n, i) => {
      const scoreLabel = n.score === null || n.score === undefined ? "—" : `${n.score} pt${n.score === 1 ? "" : "s"}`;
      return `
        <tr>
          <td>Needle ${i + 1}</td>
          <td>${escapeHtml(KARAT_SHORT[n.given] || n.given || "—")}</td>
          <td>${escapeHtml(KARAT_SHORT[n.answer] || n.answer || "—")}</td>
          <td>${scoreLabel}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="detail-grid">
      <div><span class="detail-label">Score</span>${d.totalScore ?? "—"}/10</div>
      <div><span class="detail-label">Audited by</span>${escapeHtml(d.auditorName || "—")} (${escapeHtml(d.auditorEmpCode || "—")})</div>
      <div><span class="detail-label">AP Date of Joining</span>${escapeHtml(formatDateLong(d.apDoj) || "—")}</div>
      ${d.autoFailTriggered ? `<div class="autofail-note-inline">Auto-fail: a Below 18K needle was missed</div>` : ""}
    </div>
    <table class="needle-table">
      <thead>
        <tr><th>Needle</th><th>Known</th><th>AP Answer</th><th>Score</th></tr>
      </thead>
      <tbody>${needleRows}</tbody>
    </table>
    ${d.remarks ? `<div class="remarks-block"><span class="detail-label">Remarks</span>${escapeHtml(d.remarks)}</div>` : ""}
  `;
}
