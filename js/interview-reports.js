import { requireAuth } from "./authGuard.js";
import { db, collection, getDocs, orderBy, query } from "./firebase-config.js";
import { getCities } from "./cities.js";
import { QUICK_RANGE_OPTIONS, getQuickRangeDates, filterByDateWindow } from "./interviewStats.js";
import { downloadMultiCityInterviewWorkbook } from "./exportInterviewExcel.js";

async function main() {
  await requireAuth();

  const cities = await getCities();
  const quickRangeSelect = document.getElementById("quick-range-select");
  const fromDateInput = document.getElementById("from-date-input");
  const toDateInput = document.getElementById("to-date-input");
  const exportBtn = document.getElementById("export-btn");
  const summaryLine = document.getElementById("summary-line");

  quickRangeSelect.innerHTML = QUICK_RANGE_OPTIONS.map(
    (opt) => `<option value="${opt.value}">${opt.label}</option>`
  ).join("");

  quickRangeSelect.addEventListener("change", () => {
    const dates = getQuickRangeDates(quickRangeSelect.value);
    fromDateInput.value = dates.from;
    toDateInput.value = dates.to;
    updateSummary();
  });

  let allRecords = [];

  async function loadAll() {
    summaryLine.textContent = "Loading all interview records…";
    try {
      // No city filter here — single-field orderBy, so no composite index
      // needed the way interview-city.js's city+createdAt query does.
      const q = query(collection(db, "interview_entries"), orderBy("createdAt", "desc"));
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
    const filtered = filterByDateWindow(allRecords, fromDateInput.value, toDateInput.value);
    summaryLine.textContent = `${filtered.length} record${filtered.length === 1 ? "" : "s"} across all cities match this range.`;
  }

  fromDateInput.addEventListener("change", updateSummary);
  toDateInput.addEventListener("change", updateSummary);

  exportBtn.addEventListener("click", async () => {
    const filtered = filterByDateWindow(allRecords, fromDateInput.value, toDateInput.value);
    if (filtered.length === 0) {
      alert("No records match this date range — nothing to export.");
      return;
    }

    const recordsByCity = {};
    cities.forEach((city) => {
      recordsByCity[city] = filtered.filter((r) => r.city === city);
    });

    const sortedAll = [...filtered].sort((a, b) => {
      const cityCompare = (a.city || "").localeCompare(b.city || "");
      if (cityCompare !== 0) return cityCompare;
      return (a.interviewDate || "").localeCompare(b.interviewDate || "");
    });

    const rangeLabel = describeRange(fromDateInput.value, toDateInput.value);
    const rangeSlug = (fromDateInput.value || "start") + "_to_" + (toDateInput.value || "now");
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `Oro_AllCities_Interview_${rangeSlug}_${dateStamp}.xlsx`;

    exportBtn.disabled = true;
    exportBtn.textContent = "Generating…";
    try {
      await downloadMultiCityInterviewWorkbook(recordsByCity, sortedAll, filename, rangeLabel);
    } catch (err) {
      console.error(err);
      alert("Couldn't generate the Excel file. Please try again.");
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = "⬇ Download Report";
    }
  });

  /** Human-readable description of a From/To window, for the report's subtitle. */
  function describeRange(from, to) {
    if (!from && !to) return "All time";
    if (from && to) return `${from} to ${to}`;
    if (from) return `From ${from}`;
    return `Up to ${to}`;
  }

  loadAll();
}

main();
