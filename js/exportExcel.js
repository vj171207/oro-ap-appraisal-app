// Shared Excel export logic — used by both the per-city export (city.js)
// and the all-cities report page (reports.js). Column layout intentionally
// matches the original AP Calibration Google Sheet's headers, so the
// exported file looks immediately familiar to anyone who's received the
// old-style reports before.

const LEGACY_HEADERS = [
  "SL", "Month & Year", "Test Result", "Score Out of 10",
  "Audit Official Name", "Audit Official Emp Code",
  "Appraisal Partner/ APT Name", "Appraisal Partner Employee code",
  "DOJ", "City of Calibration",
  "Needle 1 Given to AP", "Needle 1 Test Result", "Needle 1 Score",
  "Needle 2 Given to AP", "Needle 2 Test Result", "Needle 2 Score",
  "Needle 3 Given to AP", "Needle 3 Test Result", "Needle 3 Score",
  "Needle 4 Given to AP", "Needle 4 Test Result", "Needle 4 Score",
  "Needle 5 Given to AP", "Needle 5 Test Result", "Needle 5 Score",
  "Remarks",
];

export const DATE_RANGE_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "last3", label: "Last 3 months" },
  { value: "last6", label: "Last 6 months" },
  { value: "last12", label: "Last 12 months" },
  { value: "currentQ", label: "Current quarter" },
  { value: "prevQ", label: "Previous quarter" },
];

/** Returns {start, end} Date bounds for a given range key, or null for "all". */
export function getDateRangeBounds(rangeKey, now = new Date()) {
  const startOfQuarter = (year, q) => new Date(year, q * 3, 1);
  const endOfQuarter = (year, q) => new Date(year, q * 3 + 3, 0, 23, 59, 59, 999);

  switch (rangeKey) {
    case "all":
      return null;
    case "last3": {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 3);
      return { start, end: now };
    }
    case "last6": {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 6);
      return { start, end: now };
    }
    case "last12": {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 12);
      return { start, end: now };
    }
    case "currentQ": {
      const q = Math.floor(now.getMonth() / 3);
      return { start: startOfQuarter(now.getFullYear(), q), end: endOfQuarter(now.getFullYear(), q) };
    }
    case "prevQ": {
      let q = Math.floor(now.getMonth() / 3) - 1;
      let year = now.getFullYear();
      if (q < 0) {
        q = 3;
        year -= 1;
      }
      return { start: startOfQuarter(year, q), end: endOfQuarter(year, q) };
    }
    default:
      return null;
  }
}

/** Filters records by their testDate falling within the given range key's bounds. */
export function filterByDateRange(records, rangeKey, now = new Date()) {
  const bounds = getDateRangeBounds(rangeKey, now);
  if (!bounds) return records;
  return records.filter((r) => {
    if (!r.testDate) return false;
    const d = new Date(r.testDate);
    return d >= bounds.start && d <= bounds.end;
  });
}

function toLegacyDate(isoYmd) {
  if (!isoYmd) return "";
  const parts = String(isoYmd).split("-");
  if (parts.length !== 3) return isoYmd;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`; // DD/MM/YYYY, matching the original sheet's DOJ format
}

/** Converts an array of calibration records into legacy-format sheet rows (array of arrays), sorted oldest-first with a running SL. */
export function buildSheetRows(records) {
  const sorted = [...records].sort((a, b) => (a.testDate || "").localeCompare(b.testDate || ""));

  const rows = sorted.map((r, i) => {
    const needles = r.needles || [];
    const needleCells = [];
    for (let n = 0; n < 5; n++) {
      const needle = needles[n] || {};
      needleCells.push(needle.given || "", needle.answer || "", needle.score ?? "");
    }
    return [
      i + 1,
      r.monthYearLabel || "",
      r.result || "",
      r.totalScore ?? "",
      r.auditorName || "",
      r.auditorEmpCode || "",
      r.apName || "",
      r.apEmpCode || "",
      toLegacyDate(r.apDoj),
      r.city || "",
      ...needleCells,
      r.remarks || "",
    ];
  });

  return [LEGACY_HEADERS, ...rows];
}

/** Downloads a single-sheet workbook for one city's (already filtered) records. */
export function downloadSingleSheetWorkbook(records, sheetName, filename) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(buildSheetRows(records));
  XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31)); // Excel sheet name limit
  XLSX.writeFile(wb, filename);
}

/** Downloads a multi-sheet workbook: an "Overall" sheet plus one sheet per city. */
export function downloadMultiCityWorkbook(recordsByCity, allRecordsSorted, filename) {
  const wb = XLSX.utils.book_new();

  const overallWs = XLSX.utils.aoa_to_sheet(buildSheetRows(allRecordsSorted));
  XLSX.utils.book_append_sheet(wb, overallWs, "Overall");

  Object.entries(recordsByCity).forEach(([city, records]) => {
    if (records.length === 0) return;
    const ws = XLSX.utils.aoa_to_sheet(buildSheetRows(records));
    XLSX.utils.book_append_sheet(wb, ws, city.substring(0, 31));
  });

  XLSX.writeFile(wb, filename);
}
