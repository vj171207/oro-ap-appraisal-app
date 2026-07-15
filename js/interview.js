import { requireAuth } from "./authGuard.js";
import { getCities } from "./cities.js";
import { db, collection, getDocs, orderBy, query } from "./firebase-config.js";
import { QUICK_RANGE_OPTIONS, getQuickRangeDates, filterByDateWindow, classifyDecision } from "./interviewStats.js";

async function main() {
  await requireAuth();

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  const listEl = document.getElementById("city-list");
  const cities = await getCities();

  cities.forEach((city) => {
    const row = document.createElement("a");
    row.href = `interview-city.html?city=${encodeURIComponent(city)}`;
    row.className = "city-row";
    row.innerHTML = `
      <span class="name">${escapeHtml(city)}</span>
      <span class="arrow">&rarr;</span>
    `;
    listEl.appendChild(row);
  });

  // ---- Overall dashboard (Total/Selected/Rejected/Selection Rate across every city) ----

  const statTotalEl = document.getElementById("stat-total");
  const statSelectedEl = document.getElementById("stat-selected");
  const statRejectedEl = document.getElementById("stat-rejected");
  const statRateEl = document.getElementById("stat-rate");
  const decisionFilterSelect = document.getElementById("decision-filter-select");
  const quickRangeSelect = document.getElementById("quick-range-select");
  const fromDateInput = document.getElementById("from-date-input");
  const toDateInput = document.getElementById("to-date-input");
  const applyBtn = document.getElementById("apply-filters-btn");

  quickRangeSelect.innerHTML = QUICK_RANGE_OPTIONS.map(
    (opt) => `<option value="${opt.value}">${opt.label}</option>`
  ).join("");

  quickRangeSelect.addEventListener("change", () => {
    const dates = getQuickRangeDates(quickRangeSelect.value);
    fromDateInput.value = dates.from;
    toDateInput.value = dates.to;
  });

  let allRecords = [];

  async function loadAllRecords() {
    try {
      // Single-field orderBy — no composite index needed, same pattern as calibration's index.js.
      const q = query(collection(db, "interview_entries"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      allRecords = [];
      snapshot.forEach((docSnap) => allRecords.push(docSnap.data()));
      applyFilters();
    } catch (err) {
      console.error(err);
      statTotalEl.textContent = "—";
      statSelectedEl.textContent = "—";
      statRejectedEl.textContent = "—";
      statRateEl.textContent = "—";
    }
  }

  function applyFilters() {
    const dateFiltered = filterByDateWindow(allRecords, fromDateInput.value, toDateInput.value);
    const total = dateFiltered.length; // always the full date-range count — never narrowed by the Decision filter

    const decisionFilter = decisionFilterSelect.value;
    let selectedCount, rejectedCount;

    if (decisionFilter === "Selected") {
      selectedCount = dateFiltered.filter((d) => classifyDecision(d.round1Decision) === "Selected").length;
      rejectedCount = 0;
    } else if (decisionFilter === "Rejected") {
      selectedCount = 0;
      rejectedCount = dateFiltered.filter((d) => classifyDecision(d.round1Decision) === "Rejected").length;
    } else {
      selectedCount = dateFiltered.filter((d) => classifyDecision(d.round1Decision) === "Selected").length;
      rejectedCount = dateFiltered.filter((d) => classifyDecision(d.round1Decision) === "Rejected").length;
    }

    const selectionRate = total > 0 ? ((selectedCount / total) * 100).toFixed(1) : "—";
    statTotalEl.textContent = total;
    statSelectedEl.textContent = selectedCount;
    statRejectedEl.textContent = rejectedCount;
    statRateEl.textContent = selectionRate === "—" ? "—" : `${selectionRate}%`;
  }

  applyBtn.addEventListener("click", applyFilters);

  loadAllRecords();
}

main();
