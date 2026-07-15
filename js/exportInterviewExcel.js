// Excel export for AP Interview — mirrors js/exportExcel.js's ExcelJS-based
// styling pattern (title block, header row, zebra striping, outcome
// coloring), but with the interview_entries column layout and a
// Selected/Rejected/Other "Outcome" column instead of calibration's
// Pass/Fail "Test Result".
//
// Date-window filtering and quick-range helpers already live in
// interviewStats.js (shared with the dashboards) — this file only owns the
// workbook-building/styling, so the filter logic has one source of truth.
//
// Colors, borders, date formatting, the download-trigger, and the
// on-demand ExcelJS-loading logic all live in excelExportShared.js — those
// were byte-identical with exportExcel.js's copies, so they're pulled from
// one place now. Everything below (headers, columns, row-building, the
// actual styling rules) stays here, since this report's layout genuinely
// differs from calibration's.

import { classifyDecision } from "./interviewStats.js";
import { COLORS, thinBorder, toLegacyDate, todayLabel, triggerDownload, ensureExcelJSLoaded } from "./excelExportShared.js";

const HEADERS = [
  "SL", "Date", "Candidate Name", "City", "Location Detail",
  "Company", "Role", "Age", "Experience",
  "Bike Available", "DL/LLR Available",
  "Theory /4", "Practical /6", "Total /10",
  "Local Language", "Local Lang.\nProficiency", "English\nProficiency",
  "Round 1 Decision", "Outcome", "Interviewer", "Remarks",
];

const COLUMN_WIDTHS = [
  6, 12, 20, 14, 14,
  20, 14, 7, 14,
  14, 14,
  10, 10, 9,
  14, 15, 14,
  28, 11, 18, 30,
];

/** Sorts records oldest-first and assigns a running SL, matching the calibration report's convention. */
function toRowValues(records) {
  const sorted = [...records].sort((a, b) => (a.interviewDate || "").localeCompare(b.interviewDate || ""));
  return sorted.map((r, i) => {
    const outcome = classifyDecision(r.round1Decision);
    return {
      values: [
        i + 1, toLegacyDate(r.interviewDate), r.candidateName || "", r.city || "", r.locationDetail || "",
        r.company || "", r.role || "", r.age ?? "", r.experience || "",
        r.bikeAvailable || "", r.dlAvailable || "",
        r.scoreTheory ?? "", r.scorePractical ?? "", r.totalScore ?? "",
        r.localLanguage || "", r.localLanguageProficiency || "", r.englishProficiency || "",
        r.round1Decision || "", outcome, r.interviewer || "", r.remarks || "",
      ],
      outcome,
    };
  });
}

/** Builds one fully-styled sheet (title block, header, data) into an existing ExcelJS worksheet. */
function styleSheet(ws, records, { cityLabel, rangeLabel }) {
  const lastCol = HEADERS.length;
  const outcomeCol = HEADERS.indexOf("Outcome") + 1;

  ws.mergeCells(1, 1, 1, lastCol);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = "Oro · Lending Services Audit — AP Interview Report";
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
      fgColor: { argb: h === "Total /10" ? COLORS.gold : COLORS.navy },
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

      if (c === outcomeCol) {
        const isSelected = row.outcome === "Selected";
        const isRejected = row.outcome === "Rejected";
        if (isSelected || isRejected) {
          cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: isSelected ? COLORS.passText : COLORS.failText } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isSelected ? COLORS.passFill : COLORS.failFill } };
        }
      } else if (c === 3 || c === 6 || c === lastCol) {
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

/** Builds the city-wise Summary sheet: one row per city (count, selected, rejected, selection %), plus a totals row. */
function styleSummarySheet(ws, recordsByCity, rangeLabel) {
  const headers = ["City", "Interview Count", "Selected", "Rejected", "Selection %"];
  const lastCol = headers.length;

  ws.mergeCells(1, 1, 1, lastCol);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = "Oro · Lending Services Audit — AP Interview Report";
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
  let totalSelected = 0;
  let totalRejected = 0;

  cityNames.forEach((city, i) => {
    const records = recordsByCity[city];
    const count = records.length;
    const selected = records.filter((r) => classifyDecision(r.round1Decision) === "Selected").length;
    const rejected = records.filter((r) => classifyDecision(r.round1Decision) === "Rejected").length;
    const selectionPct = count > 0 ? (selected / count) * 100 : 0;
    totalCount += count;
    totalSelected += selected;
    totalRejected += rejected;

    const r = HEADER_ROW + 1 + i;
    const zebra = i % 2 === 1;
    const rowValues = [city, count, selected, rejected, `${selectionPct.toFixed(2)}%`];

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
  const totalSelectionPct = totalCount > 0 ? (totalSelected / totalCount) * 100 : 0;
  const totalValues = ["Total", totalCount, totalSelected, totalRejected, `${totalSelectionPct.toFixed(2)}%`];
  totalValues.forEach((val, ci) => {
    const cell = ws.getCell(totalRow, ci + 1);
    cell.value = val;
    cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: COLORS.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.gold } };
    cell.border = thinBorder;
    cell.alignment = { horizontal: ci === 0 ? "left" : "center", vertical: "middle", indent: ci === 0 ? 1 : 0 };
  });

  ws.getColumn(1).width = 20;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 12;
  ws.getColumn(5).width = 14;

  ws.views = [{ state: "frozen", ySplit: HEADER_ROW }];
}

/** Downloads a single-sheet styled workbook for one city's (already filtered) records. */
export async function downloadSingleSheetInterviewWorkbook(records, cityName, filename, rangeLabel) {
  await ensureExcelJSLoaded();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(cityName.substring(0, 31));
  styleSheet(ws, records, { cityLabel: cityName, rangeLabel });
  const buffer = await wb.xlsx.writeBuffer();
  triggerDownload(buffer, filename);
}

/** Downloads a multi-sheet styled workbook: a Summary sheet, an "Overall" sheet, plus one sheet per city. */
export async function downloadMultiCityInterviewWorkbook(recordsByCity, allRecordsSorted, filename, rangeLabel) {
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
