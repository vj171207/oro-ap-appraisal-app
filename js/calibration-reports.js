import { requireAuth } from "./authGuard.js";
import { db, collection, getDocs, query, where } from "./firebase-config.js";
import { QUICK_RANGE_OPTIONS, getQuickRangeDates, downloadMultiCityWorkbook } from "./calibration-exportExcel.js";
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

  // This used to fetch every calibration record in the whole collection
  // once on page load, then filter by date entirely in memory on every
  // input change — meaning the read cost was the full history's size
  // regardless of what range was ever actually selected.
  //
  // Now the date range itself is applied server-side (a `where` on
  // testDate), and a fresh, narrower fetch runs each time the range
  // changes. "All time" still reads everything — same as before — but
  // any bounded range only ever reads what's actually being exported.
  // `currentRecords` always holds exactly what matches the active range,
  // so the export handler below no longer needs to filter anything itself.

  let currentRecords = [];
  let requestSeq = 0;

  async function loadForCurrentRange() {
    const from = fromDateInput.value;
    const to = toDateInput.value;
    const mySeq = ++requestSeq;

    summaryLine.textContent = "Loading matching records…";
    try {
      const dateConstraints = [];
      if (from) dateConstraints.push(where("testDate", ">=", from));
      if (to) dateConstraints.push(where("testDate", "<=", to));

      const q = query(collection(db, "calibrations"), ...dateConstraints);
      const snapshot = await getDocs(q);
      if (mySeq !== requestSeq) return; // superseded by a newer range change

      currentRecords = [];
      snapshot.forEach((docSnap) => currentRecords.push(docSnap.data()));
      summaryLine.textContent = `${currentRecords.length} record${currentRecords.length === 1 ? "" : "s"} across all cities match this range.`;
    } catch (err) {
      if (mySeq !== requestSeq) return;
      console.error(err);
      summaryLine.textContent = "Couldn't load records. Check your connection and reload.";
    }
  }

  quickRangeSelect.addEventListener("change", () => {
    const dates = getQuickRangeDates(quickRangeSelect.value);
    fromDateInput.value = dates.from;
    toDateInput.value = dates.to;
    loadForCurrentRange();
  });

  fromDateInput.addEventListener("change", loadForCurrentRange);
  toDateInput.addEventListener("change", loadForCurrentRange);

  exportBtn.addEventListener("click", async () => {
    if (currentRecords.length === 0) {
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
    currentRecords.forEach((r) => {
      const cityKey = r.city || "(No city)";
      if (!recordsByCity[cityKey]) recordsByCity[cityKey] = [];
      recordsByCity[cityKey].push(r);
    });

    const sortedAll = [...currentRecords].sort((a, b) => {
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

  loadForCurrentRange();
}

main();
