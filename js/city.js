import { requireAuth } from "./authGuard.js";
import { db, collection, getDocs, query, where, orderBy } from "./firebase-config.js";
import { QUICK_RANGE_OPTIONS, getQuickRangeDates, filterByDateWindow, downloadSingleSheetWorkbook } from "./exportExcel.js";
import { createReconcileState, reconcileList } from "./domReconcile.js";
import { buildDetailHtml, formatDateShort, escapeHtml } from "./calibrationRecordView.js";

async function main() {
  await requireAuth();

  const params = new URLSearchParams(window.location.search);
  const city = params.get("city");

  if (!city) {
    window.location.href = "calibration-home.html";
    return;
  }

  document.getElementById("city-title").textContent = city;
  document.getElementById("new-calibration-link").href =
    `calibration.html?city=${encodeURIComponent(city)}`;

  const historyEl = document.getElementById("history-list");
  const statTotalEl = document.getElementById("stat-total");
  const statPassEl = document.getElementById("stat-pass");
  const statFailEl = document.getElementById("stat-fail");
  const statClearanceEl = document.getElementById("stat-clearance");
  const resultFilterSelect = document.getElementById("result-filter-select");
  const quickRangeSelect = document.getElementById("quick-range-select");
  const fromDateInput = document.getElementById("from-date-input");
  const toDateInput = document.getElementById("to-date-input");
  const applyBtn = document.getElementById("apply-filters-btn");
  const exportBtn = document.getElementById("export-btn");

  let allRecords = []; // fetched once from Firestore
  const historyReconcileState = createReconcileState();
  // "Applied" values are what's actually driving the current view. They only
  // change when the Apply button is clicked — the dropdowns/date inputs can
  // be changed freely without affecting anything until then.
  let appliedResultFilter = "all";
  let appliedFrom = "";
  let appliedTo = "";

  quickRangeSelect.innerHTML = QUICK_RANGE_OPTIONS.map(
    (opt) => `<option value="${opt.value}">${opt.label}</option>`
  ).join("");

  // Picking a Quick Range preset pre-fills From/To immediately — but the
  // actual filtering only happens on Apply, and From/To can still be
  // hand-edited afterward for a custom range.
  quickRangeSelect.addEventListener("change", () => {
    const dates = getQuickRangeDates(quickRangeSelect.value);
    fromDateInput.value = dates.from;
    toDateInput.value = dates.to;
  });

  async function loadHistory() {
    try {
      const q = query(
        collection(db, "calibrations"),
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
    if (appliedResultFilter !== "all") {
      records = records.filter((d) => d.result === appliedResultFilter);
    }
    return records;
  }

  /** Called on load and whenever Apply is clicked — updates both the stats panel and the list together, based on the currently applied filters. */
  function applyFilters() {
    appliedResultFilter = resultFilterSelect.value;
    appliedFrom = fromDateInput.value;
    appliedTo = toDateInput.value;

    // Stats use only the date filter — the Result dropdown should never
    // shrink the Total (that made Clearance always read 100% whenever
    // "Pass" was selected, since Total collapsed down to the Pass count).
    // The visible history list below still correctly uses BOTH filters —
    // narrowing the list by Result is legitimate, this only fixes the stats.
    const dateFiltered = filterByDateWindow(allRecords, appliedFrom, appliedTo);
    renderStats(dateFiltered);

    const fullyFiltered = getAppliedRecords();
    renderList(fullyFiltered);
  }

  function renderStats(dateFiltered) {
    const total = dateFiltered.length; // always the full date-range count, never narrowed by Result

    let passCount, failCount;
    if (appliedResultFilter === "Pass") {
      passCount = dateFiltered.filter((d) => d.result === "Pass").length;
      failCount = 0;
    } else if (appliedResultFilter === "Fail") {
      passCount = 0;
      failCount = dateFiltered.filter((d) => d.result === "Fail").length;
    } else {
      passCount = dateFiltered.filter((d) => d.result === "Pass").length;
      failCount = dateFiltered.filter((d) => d.result === "Fail").length;
    }

    const clearance = total > 0 ? ((passCount / total) * 100).toFixed(1) : "—";
    statTotalEl.textContent = total;
    statPassEl.textContent = passCount;
    statFailEl.textContent = failCount;
    statClearanceEl.textContent = clearance === "—" ? "—" : `${clearance}%`;
  }

  function renderList(visible) {
    if (allRecords.length === 0) {
      historyEl.innerHTML = `<div class="empty-state">No calibrations recorded for ${escapeHtml(city)} yet. Start one above.</div>`;
      historyReconcileState.nodesByKey.clear();
      historyReconcileState.initialized = false; // next non-empty render should clear this empty-state message first
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
    const isPass = d.result === "Pass";
    const item = document.createElement("div");
    item.className = "history-item-expandable";

    const dateLabel = formatDateShort(d.testDate) || "—";

    item.innerHTML = `
      <button type="button" class="history-summary">
        <span class="ap-info">
          <span class="name">${escapeHtml(d.apName || "—")} - ${escapeHtml(d.apEmpCode || "—")}</span>
        </span>
        <span class="history-date">${dateLabel}</span>
        <span class="result-icon ${isPass ? "pass" : "fail"}">${isPass ? "✓" : "✗"}</span>
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
    const records = getAppliedRecords();
    if (records.length === 0) {
      alert("No records match the current filters — nothing to export.");
      return;
    }
    const rangeLabel = describeRange(appliedFrom, appliedTo);
    const rangeSlug = (appliedFrom || "start") + "_to_" + (appliedTo || "now");
    const resultLabel = appliedResultFilter === "all" ? "" : `_${appliedResultFilter}`;
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `${city}_${rangeSlug}${resultLabel}_${dateStamp}.xlsx`;

    exportBtn.disabled = true;
    exportBtn.textContent = "Generating…";
    try {
      await downloadSingleSheetWorkbook(records, city, filename, rangeLabel);
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
