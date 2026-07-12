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
//
// QUICK_RANGE_OPTIONS/getQuickRangeDates are pure date math shared with AP
// Interview's interviewStats.js — both re-export the same implementation
// from dateRangeUtils.js rather than each defining their own copy.
export { QUICK_RANGE_OPTIONS, getQuickRangeDates } from "./dateRangeUtils.js";
import { filterByDateField } from "./dateRangeUtils.js";

/** Filters records whose testDate falls within [fromStr, toStr] (inclusive). Empty string on either side means unbounded on that side. Both testDate and fromStr/toStr are "YYYY-MM-DD", so plain string comparison is correct. */
export function filterByDateWindow(records, fromStr, toStr) {
  return filterByDateField(records, "testDate", fromStr, toStr);
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

/** Builds the city-wise Summary sheet: one row per city (count, fails, clearance %), plus a totals row. */
function styleSummarySheet(ws, recordsByCity, rangeLabel) {
  const headers = ["City", "Calibration Count", "Failed Numbers", "Clearance %"];
  const lastCol = headers.length;

  ws.mergeCells(1, 1, 1, lastCol);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = "Oro · Lending Services Audit — AP Appraisal Calibration Report";
  titleCell.font = { name: "Calibri", size: 15, bold: true, color: { argb: COLORS.white } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navy } };
  titleCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  ws.getRow(1).height = 28;

  ws.mergeCells(2, 1, 2, lastCol);
  const subtitleCell = ws.getCell(2, 1);
  subtitleCell.value = `Summary by city   |   Date range: ${rangeLabel}   |   Generated: ${todayLabel()}`;
  subtitleCell.font = { name: "Calibri", size: 10.5, italic: true, color: { argb: COLORS.mutedText } };
  subtitleCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  ws.getRow(2).height = 20;

  ws.getRow(3).height = 6;

  const HEADER_ROW = 4;
  headers.forEach((h, i) => {
    const cell = ws.getCell(HEADER_ROW, i + 1);
    cell.value = h;
    cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: COLORS.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navy } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder;
  });
  ws.getRow(HEADER_ROW).height = 24;

  const cityNames = Object.keys(recordsByCity).filter((city) => recordsByCity[city].length > 0);
  let totalCount = 0;
  let totalFails = 0;

  cityNames.forEach((city, i) => {
    const records = recordsByCity[city];
    const count = records.length;
    const fails = records.filter((r) => r.result === "Fail").length;
    const clearancePct = count > 0 ? ((count - fails) / count) * 100 : 0;
    totalCount += count;
    totalFails += fails;

    const r = HEADER_ROW + 1 + i;
    const zebra = i % 2 === 1;
    const rowValues = [city, count, fails, `${clearancePct.toFixed(2)}%`];

    rowValues.forEach((val, ci) => {
      const cell = ws.getCell(r, ci + 1);
      cell.value = val;
      cell.font = { name: "Calibri", size: 10.5 };
      cell.border = thinBorder;
      cell.alignment = { horizontal: ci === 0 ? "left" : "center", vertical: "middle", indent: ci === 0 ? 1 : 0 };
      if (zebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.zebra } };
    });
  });

  // Totals row
  const totalRow = HEADER_ROW + 1 + cityNames.length;
  const totalClearance = totalCount > 0 ? ((totalCount - totalFails) / totalCount) * 100 : 0;
  const totalValues = ["Total", totalCount, totalFails, `${totalClearance.toFixed(2)}%`];
  totalValues.forEach((val, ci) => {
    const cell = ws.getCell(totalRow, ci + 1);
    cell.value = val;
    cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: COLORS.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.gold } };
    cell.border = thinBorder;
    cell.alignment = { horizontal: ci === 0 ? "left" : "center", vertical: "middle", indent: ci === 0 ? 1 : 0 };
  });

  ws.getColumn(1).width = 20;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 16;
  ws.getColumn(4).width = 14;

  ws.views = [{ state: "frozen", ySplit: HEADER_ROW }];
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

const EXCELJS_CDN_URL = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";

// ExcelJS is a large library (several hundred KB) that used to be loaded
// unconditionally in <head> on every visit to city.html/reports.html, even
// though most visits never click Export — that blocked page rendering for
// a feature used a small fraction of the time. Loaded on-demand instead,
// only when an export is actually requested. Cached so a second export in
// the same session doesn't re-fetch or re-inject the script tag, and safe
// to call concurrently (e.g. double-clicking Export) without loading twice.
let exceljsLoadPromise = null;

function ensureExcelJSLoaded() {
  if (typeof ExcelJS !== "undefined") return Promise.resolve();
  if (exceljsLoadPromise) return exceljsLoadPromise;

  exceljsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = EXCELJS_CDN_URL;
    script.onload = () => resolve();
    script.onerror = () => {
      exceljsLoadPromise = null; // allow retry on a later export attempt
      reject(new Error("Couldn't load the Excel export library. Check your connection and try again."));
    };
    document.head.appendChild(script);
  });

  return exceljsLoadPromise;
}

/** Downloads a single-sheet styled workbook for one city's (already filtered) records. */
export async function downloadSingleSheetWorkbook(records, cityName, filename, rangeLabel) {
  await ensureExcelJSLoaded();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(cityName.substring(0, 31));
  styleSheet(ws, records, { cityLabel: cityName, rangeLabel });
  const buffer = await wb.xlsx.writeBuffer();
  triggerDownload(buffer, filename);
}

/** Downloads a multi-sheet styled workbook: an "Overall" sheet plus one sheet per city. */
export async function downloadMultiCityWorkbook(recordsByCity, allRecordsSorted, filename, rangeLabel) {
  await ensureExcelJSLoaded();
  const wb = new ExcelJS.Workbook();

  const summaryWs = wb.addWorksheet("Summary");
  styleSummarySheet(summaryWs, recordsByCity, rangeLabel);

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
