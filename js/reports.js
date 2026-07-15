import { requireAuth } from "./authGuard.js";
import { db, collection, getDocs, orderBy, query } from "./firebase-config.js";
import { QUICK_RANGE_OPTIONS, getQuickRangeDates, filterByDateWindow, downloadMultiCityWorkbook } from "./exportExcel.js";
import { describeRange } from "./dateRangeUtils.js";

async function main() {
  await requireAuth();

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

    // Grouped by whatever city value each record actually has, not by the
    // CURRENT config/cities list — a record saved under a city that's
    // since been renamed or removed would otherwise silently vanish from
    // every per-city sheet here (it would still exist in Firestore, and
    // still appear in the "Overall" sheet below, just invisible in this
    // specific grouped view). Grouping from the records themselves means
    // a record always lands somewhere sensible, no matter what happened
    // to that city's entry in Settings afterward.
    const recordsByCity = {};
    filtered.forEach((r) => {
      const cityKey = r.city || "(No city)";
      if (!recordsByCity[cityKey]) recordsByCity[cityKey] = [];
      recordsByCity[cityKey].push(r);
    });

    const sortedAll = [...filtered].sort((a, b) => {
      const cityCompare = (a.city || "").localeCompare(b.city || "");
      if (cityCompare !== 0) return cityCompare;
      return (a.testDate || "").localeCompare(b.testDate || "");
    });

    const rangeLabel = describeRange(fromDateInput.value, toDateInput.value);
    const rangeSlug = (fromDateInput.value || "start") + "_to_" + (toDateInput.value || "now");
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
