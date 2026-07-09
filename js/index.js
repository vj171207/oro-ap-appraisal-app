import { requireAuth } from "./authGuard.js";
import { getCities } from "./cities.js";
import { db, collection, getDocs, orderBy, query } from "./firebase-config.js";
import { DATE_RANGE_OPTIONS, filterByDateRange } from "./exportExcel.js";

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
  const resultFilterSelect = document.getElementById("result-filter-select");
  const dateRangeSelect = document.getElementById("date-range-select");
  const applyBtn = document.getElementById("apply-filters-btn");

  dateRangeSelect.innerHTML = DATE_RANGE_OPTIONS.map(
    (opt) => `<option value="${opt.value}">${opt.label}</option>`
  ).join("");

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
    }
  }

  function applyFilters() {
    let filtered = filterByDateRange(allRecords, dateRangeSelect.value);
    const resultFilter = resultFilterSelect.value;
    if (resultFilter !== "all") {
      filtered = filtered.filter((d) => d.result === resultFilter);
    }
    const total = filtered.length;
    const passCount = filtered.filter((d) => d.result === "Pass").length;
    const failCount = filtered.filter((d) => d.result === "Fail").length;
    statTotalEl.textContent = total;
    statPassEl.textContent = passCount;
    statFailEl.textContent = failCount;
  }

  applyBtn.addEventListener("click", applyFilters);

  loadAllRecords();
}

main();
