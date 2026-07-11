import { requireAuth } from "./authGuard.js";
import { db, collection, getDocs, query, where, orderBy } from "./firebase-config.js";
import { QUICK_RANGE_OPTIONS, getQuickRangeDates, filterByDateWindow, computeDecisionStats, classifyDecision } from "./interviewStats.js";

async function main() {
  await requireAuth();

  const params = new URLSearchParams(window.location.search);
  const city = params.get("city");

  if (!city) {
    window.location.href = "interview.html";
    return;
  }

  document.getElementById("city-title").textContent = city;
  document.getElementById("new-interview-link").href =
    `interview-entry.html?city=${encodeURIComponent(city)}`;

  const historyEl = document.getElementById("history-list");
  const statTotalEl = document.getElementById("stat-total");
  const statSelectedEl = document.getElementById("stat-selected");
  const statRejectedEl = document.getElementById("stat-rejected");
  const statRateEl = document.getElementById("stat-rate");
  const quickRangeSelect = document.getElementById("quick-range-select");
  const fromDateInput = document.getElementById("from-date-input");
  const toDateInput = document.getElementById("to-date-input");
  const applyBtn = document.getElementById("apply-filters-btn");

  let allRecords = [];
  let appliedFrom = "";
  let appliedTo = "";

  quickRangeSelect.innerHTML = QUICK_RANGE_OPTIONS.map(
    (opt) => `<option value="${opt.value}">${opt.label}</option>`
  ).join("");

  quickRangeSelect.addEventListener("change", () => {
    const dates = getQuickRangeDates(quickRangeSelect.value);
    fromDateInput.value = dates.from;
    toDateInput.value = dates.to;
  });

  async function loadHistory() {
    try {
      const q = query(
        collection(db, "interview_entries"),
        where("city", "==", city),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(q);

      allRecords = [];
      snapshot.forEach((docSnap) => allRecords.push(docSnap.data()));

      applyFilters();
    } catch (err) {
      console.error(err);
      historyEl.innerHTML = `<div class="empty-state">Couldn't load history. Check your connection and reload.</div>`;
    }
  }

  function applyFilters() {
    appliedFrom = fromDateInput.value;
    appliedTo = toDateInput.value;

    const dateFiltered = filterByDateWindow(allRecords, appliedFrom, appliedTo);
    renderStats(dateFiltered);
    renderList(dateFiltered);
  }

  function renderStats(dateFiltered) {
    const { total, selected, rejected, selectionRate } = computeDecisionStats(dateFiltered);
    statTotalEl.textContent = total;
    statSelectedEl.textContent = selected;
    statRejectedEl.textContent = rejected;
    statRateEl.textContent = selectionRate === "—" ? "—" : `${selectionRate}%`;
  }

  function renderList(visible) {
    if (allRecords.length === 0) {
      historyEl.innerHTML = `<div class="empty-state">No interview entries recorded for ${city} yet. Start one above.</div>`;
      return;
    }

    if (visible.length === 0) {
      historyEl.innerHTML = `<div class="empty-state">No results match the current filters.</div>`;
      return;
    }

    historyEl.innerHTML = "";

    visible.forEach((d) => {
      const outcome = classifyDecision(d.round1Decision);
      const isSelected = outcome === "Selected";
      const isRejected = outcome === "Rejected";
      const item = document.createElement("div");
      item.className = "history-item-expandable";

      const dateLabel = formatDateShort(d.interviewDate) || "—";
      const iconClass = isSelected ? "pass" : isRejected ? "fail" : "";
      const icon = isSelected ? "✓" : isRejected ? "✗" : "•";

      item.innerHTML = `
        <button type="button" class="history-summary">
          <span class="ap-info">
            <span class="name">${escapeHtml(d.candidateName || "—")}</span>
          </span>
          <span class="history-date">${dateLabel}</span>
          <span class="result-icon ${iconClass}">${icon}</span>
          <span class="chevron">&rsaquo;</span>
        </button>
        <div class="history-detail" hidden></div>
      `;

      const detailEl = item.querySelector(".history-detail");
      const summaryBtn = item.querySelector(".history-summary");
      let rendered = false;

      summaryBtn.addEventListener("click", () => {
        const isHidden = detailEl.hasAttribute("hidden");
        if (isHidden) {
          if (!rendered) {
            detailEl.innerHTML = buildDetailHtml(d);
            rendered = true;
          }
          detailEl.removeAttribute("hidden");
          item.classList.add("expanded");
        } else {
          detailEl.setAttribute("hidden", "");
          item.classList.remove("expanded");
        }
      });

      historyEl.appendChild(item);
    });
  }

  applyBtn.addEventListener("click", applyFilters);

  function buildDetailHtml(d) {
    return `
      <div class="detail-grid">
        <div><span class="detail-label">Company</span>${escapeHtml(d.company || "—")}</div>
        <div><span class="detail-label">Role</span>${escapeHtml(d.role || "—")}</div>
        <div><span class="detail-label">Age</span>${d.age ?? "—"}</div>
        <div><span class="detail-label">Experience</span>${escapeHtml(d.experience || "—")}</div>
        <div><span class="detail-label">Bike / DL</span>${escapeHtml(d.bikeAvailable || "—")} / ${escapeHtml(d.dlAvailable || "—")}</div>
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

  /** DD/MM/YY, for the compact collapsed row. */
  function formatDateShort(isoYmd) {
    if (!isoYmd) return "";
    const parts = String(isoYmd).split("-");
    if (parts.length !== 3) return "";
    const [y, m, day] = parts;
    return `${day}/${m}/${y.slice(-2)}`;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  loadHistory();
}

main();
