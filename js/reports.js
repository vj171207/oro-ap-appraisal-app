import { requireAuth } from "./authGuard.js";
import { db, collection, getDocs, orderBy, query } from "./firebase-config.js";
import { CITIES } from "./cities.js";
import { DATE_RANGE_OPTIONS, filterByDateRange, downloadMultiCityWorkbook } from "./exportExcel.js";

async function main() {
  await requireAuth();

  const dateRangeSelect = document.getElementById("date-range-select");
  const exportBtn = document.getElementById("export-btn");
  const summaryLine = document.getElementById("summary-line");

  dateRangeSelect.innerHTML = DATE_RANGE_OPTIONS.map(
    (opt) => `<option value="${opt.value}">${opt.label}</option>`
  ).join("");

  let allRecords = [];

  async function loadAll() {
    summaryLine.textContent = "Loading all calibration records…";
    try {
      // No city filter here — this is a single-field orderBy, so it doesn't
      // need a composite index the way city.js's city+createdAt query does.
      const q = query(collection(db, "calibrations"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      allRecords = [];
      snapshot.forEach((docSnap) => allRecords.push(docSnap.data()));
      updateSummary();
    } catch (err) {
      console.error(err);
      summaryLine.textContent = "Couldn't load records. Check your connection and reload.";
    }
  }

  function updateSummary() {
    const filtered = filterByDateRange(allRecords, dateRangeSelect.value);
    summaryLine.textContent = `${filtered.length} record${filtered.length === 1 ? "" : "s"} across all cities match this range.`;
  }

  dateRangeSelect.addEventListener("change", updateSummary);

  exportBtn.addEventListener("click", async () => {
    const filtered = filterByDateRange(allRecords, dateRangeSelect.value);
    if (filtered.length === 0) {
      alert("No records match this date range — nothing to export.");
      return;
    }

    const recordsByCity = {};
    CITIES.forEach((city) => {
      recordsByCity[city] = filtered.filter((r) => r.city === city);
    });

    const sortedAll = [...filtered].sort((a, b) => {
      const cityCompare = (a.city || "").localeCompare(b.city || "");
      if (cityCompare !== 0) return cityCompare;
      return (a.testDate || "").localeCompare(b.testDate || "");
    });

    const rangeLabel = DATE_RANGE_OPTIONS.find((o) => o.value === dateRangeSelect.value)?.label || "All time";
    const rangeSlug = rangeLabel.replace(/\s+/g, "");
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `Oro_AllCities_Calibration_${rangeSlug}_${dateStamp}.xlsx`;

    exportBtn.disabled = true;
    exportBtn.textContent = "Generating…";
    try {
      await downloadMultiCityWorkbook(recordsByCity, sortedAll, filename, rangeLabel);
    } catch (err) {
      console.error(err);
      alert("Couldn't generate the Excel file. Please try again.");
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = "⬇ Download Report";
    }
  });

  loadAll();

}

main();
