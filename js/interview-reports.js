import { requireAuth } from "./authGuard.js";
import { db, collection, getDocs, query, where } from "./firebase-config.js";
import { QUICK_RANGE_OPTIONS, getQuickRangeDates } from "./interviewStats.js";
import { describeRange } from "./dateRangeUtils.js";
import { downloadMultiCityInterviewWorkbook } from "./exportInterviewExcel.js";

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

  // Same fix as reports.js (calibration's all-cities report) — see that
  // file for the full reasoning. The date range is now applied server-side
  // via a `where` on interviewDate, and a fresh, narrower fetch runs each
  // time the range changes, instead of fetching the whole interview_entries
  // collection once and filtering it in memory forever. "All time" still
  // reads everything; any bounded range only reads what's being exported.

  let currentRecords = [];
  let requestSeq = 0;

  async function loadForCurrentRange() {
    const from = fromDateInput.value;
    const to = toDateInput.value;
    const mySeq = ++requestSeq;

    summaryLine.textContent = "Loading matching records…";
    try {
      const dateConstraints = [];
      if (from) dateConstraints.push(where("interviewDate", ">=", from));
      if (to) dateConstraints.push(where("interviewDate", "<=", to));

      const q = query(collection(db, "interview_entries"), ...dateConstraints);
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
    // CURRENT config/cities list — see reports.js for the full reasoning
    // (a record under a renamed/removed city would otherwise silently
    // vanish from every per-city sheet here, though it stays visible in
    // Firestore and in the "Overall" sheet below).
    const recordsByCity = {};
    currentRecords.forEach((r) => {
      const cityKey = r.city || "(No city)";
      if (!recordsByCity[cityKey]) recordsByCity[cityKey] = [];
      recordsByCity[cityKey].push(r);
    });

    const sortedAll = [...currentRecords].sort((a, b) => {
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

  loadForCurrentRange();
}

main();
