import { requireAuth } from "./authGuard.js";
import { db, collection, getDocs, query, where, orderBy } from "./firebase-config.js";
import { QUICK_RANGE_OPTIONS, getQuickRangeDates, filterByDateWindow, computeDecisionStats, classifyDecision } from "./interviewStats.js";
import { downloadSingleSheetInterviewWorkbook } from "./exportInterviewExcel.js";
import { createReconcileState, reconcileList } from "./domReconcile.js";
import { buildDetailHtml, formatDateShort, escapeHtml } from "./interviewRecordView.js";

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
  const decisionFilterSelect = document.getElementById("decision-filter-select");
  const quickRangeSelect = document.getElementById("quick-range-select");
  const fromDateInput = document.getElementById("from-date-input");
  const toDateInput = document.getElementById("to-date-input");
  const applyBtn = document.getElementById("apply-filters-btn");
  const exportBtn = document.getElementById("export-btn");

  let allRecords = [];
  let visibleRecords = [];
  const historyReconcileState = createReconcileState();
  let appliedDecisionFilter = "all";
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
      snapshot.forEach((docSnap) => allRecords.push({ ...docSnap.data(), _docId: docSnap.id }));

      applyFilters();
    } catch (err) {
      console.error(err);
      historyEl.innerHTML = `<div class="empty-state">Couldn't load history. Check your connection and reload.</div>`;
    }
  }

  function getAppliedRecords() {
    let records = filterByDateWindow(allRecords, appliedFrom, appliedTo);
    if (appliedDecisionFilter !== "all") {
      records = records.filter((d) => classifyDecision(d.round1Decision) === appliedDecisionFilter);
    }
    return records;
  }

  function applyFilters() {
    appliedDecisionFilter = decisionFilterSelect.value;
    appliedFrom = fromDateInput.value;
    appliedTo = toDateInput.value;

    // Stats use only the date filter — the Decision dropdown should never
    // shrink Total (same bug as calibration's Result filter once did: it
    // made Selection Rate always read 100%/0% whenever a specific Decision
    // was chosen, since Total collapsed down to match). The visible history
    // list below still correctly uses BOTH filters — narrowing the list by
    // Decision is legitimate, this only fixes the stats.
    const dateFiltered = filterByDateWindow(allRecords, appliedFrom, appliedTo);
    renderStats(dateFiltered);

    visibleRecords = getAppliedRecords();
    renderList(visibleRecords);
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
      historyEl.innerHTML = `<div class="empty-state">No interview entries recorded for ${escapeHtml(city)} yet. Start one above.</div>`;
      historyReconcileState.nodesByKey.clear();
      historyReconcileState.initialized = false;
      return;
    }

    reconcileList(historyEl, visible, historyReconcileState, {
      getKey: (d) => d._docId,
      buildRow: buildHistoryRow,
      emptyMessageHtml: `<div class="empty-state">No results match the current filters.</div>`,
    });
  }

  /** Builds one collapsed history row with its expand/collapse behavior wired up. Called once per record ever (see domReconcile.js) — not on every filter change. */
  function buildHistoryRow(d) {
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

    return item;
  }

  applyBtn.addEventListener("click", applyFilters);

  exportBtn.addEventListener("click", async () => {
    if (visibleRecords.length === 0) {
      alert("No records match the current filters — nothing to export.");
      return;
    }

    const rangeLabel = describeRange(appliedFrom, appliedTo);
    const rangeSlug = (appliedFrom || "start") + "_to_" + (appliedTo || "now");
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `Oro_${city}_Interview_${rangeSlug}_${dateStamp}.xlsx`;

    exportBtn.disabled = true;
    exportBtn.textContent = "Generating…";
    try {
      await downloadSingleSheetInterviewWorkbook(visibleRecords, city, filename, rangeLabel);
    } catch (err) {
      console.error(err);
      alert("Couldn't generate the Excel file. Please try again.");
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = "⬇ Export to Excel";
    }
  });

  /** Human-readable description of a From/To window, for the report's subtitle. */
  function describeRange(from, to) {
    if (!from && !to) return "All time";
    if (from && to) return `${from} to ${to}`;
    if (from) return `From ${from}`;
    return `Up to ${to}`;
  }

  loadHistory();
}

main();
