// Shared Excel export logic — used by both the per-city export (city.js)
// and the all-cities report page (reports.js).
//
// Uses ExcelJS (loaded via CDN as the global `ExcelJS`) rather than
// SheetJS, because SheetJS's free/community build does not support writing
// cell colors or fonts at all — that's a Pro-only feature there. ExcelJS is
// fully free/open-source and supports complete styling in the browser.
//
// Column layout matches the original AP Calibration Google Sheet's headers,
// so the export looks immediately familiar — but with a more legible,
// professional visual design (wider columns, softer colors, a title block)
// instead of the original's cramped defaults and harsh bright colors.

// Quick Range only pre-fills the From/To date inputs — it's a convenience,
// not the actual filter mechanism. The From/To values themselves (editable
// afterward for a fully custom range) are what filterByDateWindow uses.
export const QUICK_RANGE_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "last3", label: "Last 3 months" },
];

/** Returns {from, to} as "YYYY-MM-DD" strings for a quick-range key, or {from:"", to:""} for "all" (i.e. unbounded/clear). */
export function getQuickRangeDates(rangeKey, now = new Date()) {
  const toIso = (d) => d.toISOString().slice(0, 10);

  if (rangeKey === "last3") {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 3);
    return { from: toIso(start), to: toIso(now) };
  }
  return { from: "", to: "" };
}

/** Filters records whose testDate falls within [fromStr, toStr] (inclusive). Empty string on either side means unbounded on that side. Both testDate and fromStr/toStr are "YYYY-MM-DD", so plain string comparison is correct. */
export function filterByDateWindow(records, fromStr, toStr) {
  return records.filter((r) => {
    if (!r.testDate) return false;
    if (fromStr && r.testDate < fromStr) return false;
    if (toStr && r.testDate > toStr) return false;
    return true;
  });
}

// ---------------------------------------------------------------------
// Report styling
// ---------------------------------------------------------------------

const COLORS = {
  navy: "FF1F2937",
  white: "FFFFFFFF",
  gold: "FFB08D57",
  mutedText: "FF5B6472",
  passFill: "FFDCEEE3",
  passText: "FF1E6B45",
  failFill: "FFF8DCD9",
  failText: "FFA32E23",
  zebra: "FFF7F7F8",
  border: "FFD8DCE3",
};

const HEADERS = [
  "SL", "Month & Year", "Test Result", "Score /10",
  "Auditor Name", "Auditor Code",
  "AP Name", "AP Code", "AP DOJ", "City",
  "Needle 1\nGiven", "Needle 1\nAnswer", "Needle 1\nScore",
  "Needle 2\nGiven", "Needle 2\nAnswer", "Needle 2\nScore",
  "Needle 3\nGiven", "Needle 3\nAnswer", "Needle 3\nScore",
  "Needle 4\nGiven", "Needle 4\nAnswer", "Needle 4\nScore",
  "Needle 5\nGiven", "Needle 5\nAnswer", "Needle 5\nScore",
  "Remarks",
];

const COLUMN_WIDTHS = [6, 12, 12, 10, 18, 14, 20, 14, 13, 12,
  11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 28];

const thinBorder = {
  top: { style: "thin", color: { argb: COLORS.border } },
  left: { style: "thin", color: { argb: COLORS.border } },
  bottom: { style: "thin", color: { argb: COLORS.border } },
  right: { style: "thin", color: { argb: COLORS.border } },
};

function toLegacyDate(isoYmd) {
  if (!isoYmd) return "";
  const parts = String(isoYmd).split("-");
  if (parts.length !== 3) return isoYmd;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

function todayLabel() {
  const d = new Date();
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${String(d.getDate()).padStart(2, "0")} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** Sorts records oldest-first and assigns a running SL, matching the original sheet's convention. */
function toRowValues(records) {
  const sorted = [...records].sort((a, b) => (a.testDate || "").localeCompare(b.testDate || ""));
  return sorted.map((r, i) => {
    const needles = r.needles || [];
    const needleCells = [];
    for (let n = 0; n < 5; n++) {
      const needle = needles[n] || {};
      needleCells.push(needle.given || "", needle.answer || "", needle.score ?? "");
    }
    return {
      sl: i + 1,
      values: [
        i + 1, r.monthYearLabel || "", r.result || "", r.totalScore ?? "",
        r.auditorName || "", r.auditorEmpCode || "",
        r.apName || "", r.apEmpCode || "", toLegacyDate(r.apDoj), r.city || "",
        ...needleCells,
        r.remarks || "",
      ],
      isFail: r.result === "Fail",
    };
  });
}

/** Builds one fully-styled sheet (title block, header, data) into an existing ExcelJS worksheet. */
function styleSheet(ws, records, { cityLabel, rangeLabel }) {
  const lastCol = HEADERS.length;

  ws.mergeCells(1, 1, 1, lastCol);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = "Oro · Lending Services Audit — AP Appraisal Calibration Report";
  titleCell.font = { name: "Calibri", size: 15, bold: true, color: { argb: COLORS.white } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navy } };
  titleCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  ws.getRow(1).height = 28;

  ws.mergeCells(2, 1, 2, lastCol);
  const subtitleCell = ws.getCell(2, 1);
  subtitleCell.value = `City: ${cityLabel}   |   Date range: ${rangeLabel}   |   Generated: ${todayLabel()}`;
  subtitleCell.font = { name: "Calibri", size: 10.5, italic: true, color: { argb: COLORS.mutedText } };
  subtitleCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  ws.getRow(2).height = 20;

  ws.getRow(3).height = 6;

  const HEADER_ROW = 4;
  HEADERS.forEach((h, i) => {
    const cell = ws.getCell(HEADER_ROW, i + 1);
    cell.value = h;
    cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: COLORS.white } };
    cell.fill = {
      type: "pattern", pattern: "solid",
      fgColor: { argb: h === "Score /10" ? COLORS.gold : COLORS.navy },
    };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder;
  });
  ws.getRow(HEADER_ROW).height = 32;

  const rows = toRowValues(records);
  rows.forEach((row, i) => {
    const r = HEADER_ROW + 1 + i;
    const zebra = i % 2 === 1;

    row.values.forEach((val, ci) => {
      const c = ci + 1;
      const cell = ws.getCell(r, c);
      cell.value = val;
      cell.font = { name: "Calibri", size: 10.5 };
      cell.border = thinBorder;
      cell.alignment = { horizontal: "center", vertical: "middle" };

      if (c === 3) {
        cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: row.isFail ? COLORS.failText : COLORS.passText } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: row.isFail ? COLORS.failFill : COLORS.passFill } };
      } else if (c === 7 || c === lastCol) {
        cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
        if (zebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.zebra } };
      } else if (zebra) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.zebra } };
      }
    });
  });

  COLUMN_WIDTHS.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  ws.views = [{ state: "frozen", ySplit: HEADER_ROW }];
  ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: lastCol } };
}

function triggerDownload(buffer, filename) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Downloads a single-sheet styled workbook for one city's (already filtered) records. */
export async function downloadSingleSheetWorkbook(records, cityName, filename, rangeLabel) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(cityName.substring(0, 31));
  styleSheet(ws, records, { cityLabel: cityName, rangeLabel });
  const buffer = await wb.xlsx.writeBuffer();
  triggerDownload(buffer, filename);
}

/** Downloads a multi-sheet styled workbook: an "Overall" sheet plus one sheet per city. */
export async function downloadMultiCityWorkbook(recordsByCity, allRecordsSorted, filename, rangeLabel) {
  const wb = new ExcelJS.Workbook();

  const overallWs = wb.addWorksheet("Overall");
  styleSheet(overallWs, allRecordsSorted, { cityLabel: "All Cities (Overall)", rangeLabel });

  Object.entries(recordsByCity).forEach(([city, records]) => {
    if (records.length === 0) return;
    const ws = wb.addWorksheet(city.substring(0, 31));
    styleSheet(ws, records, { cityLabel: city, rangeLabel });
  });

  const buffer = await wb.xlsx.writeBuffer();
  triggerDownload(buffer, filename);
}
