import { requireAuth } from "./authGuard.js";
import { getCities } from "./cities.js";
import { db, collection, getDocs, orderBy, query } from "./firebase-config.js";
import { QUICK_RANGE_OPTIONS, getQuickRangeDates, filterByDateWindow } from "./exportExcel.js";

async function main() {
  await requireAuth();

  const listEl = document.getElementById("city-list");
  const cities = await getCities();

  cities.forEach((city) => {
    const row = document.createElement("a");
    row.href = `city.html?city=${encodeURIComponent(city)}`;
    row.className = "city-row";
    row.innerHTML = `
      <span class="name">${city}</span>
      <span class="arrow">&rarr;</span>
    `;
    listEl.appendChild(row);
  });

  // ---- All-cities dashboard (Total/Pass/Fail across every city) ----

  const statTotalEl = document.getElementById("stat-total");
  const statPassEl = document.getElementById("stat-pass");
  const statFailEl = document.getElementById("stat-fail");
  const statClearanceEl = document.getElementById("stat-clearance");
  const resultFilterSelect = document.getElementById("result-filter-select");
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
      // Single-field orderBy — no composite index needed, same pattern as reports.js.
      const q = query(collection(db, "calibrations"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      allRecords = [];
      snapshot.forEach((docSnap) => allRecords.push(docSnap.data()));
      applyFilters();
    } catch (err) {
      console.error(err);
      statTotalEl.textContent = "—";
      statPassEl.textContent = "—";
      statFailEl.textContent = "—";
      statClearanceEl.textContent = "—";
    }
  }

  function applyFilters() {
    const dateFiltered = filterByDateWindow(allRecords, fromDateInput.value, toDateInput.value);
    const total = dateFiltered.length; // always the full date-range count — never narrowed by the Result filter

    const resultFilter = resultFilterSelect.value;
    let passCount, failCount;

    if (resultFilter === "Pass") {
      passCount = dateFiltered.filter((d) => d.result === "Pass").length;
      failCount = 0;
    } else if (resultFilter === "Fail") {
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

  applyBtn.addEventListener("click", applyFilters);

  loadAllRecords();
}

main();
