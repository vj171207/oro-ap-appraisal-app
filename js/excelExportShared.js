// js/excelExportShared.js
// The parts of exportExcel.js and exportInterviewExcel.js that were
// byte-for-byte identical between the two files — colors, borders, date
// formatting, the download-trigger, and the on-demand ExcelJS-loading
// pattern. Extracted here so a future change (e.g. bumping the ExcelJS CDN
// version, or adjusting a color) only needs to happen once.
//
// Deliberately does NOT include anything that actually differs between the
// two reports — headers, column widths, row-building, and the per-sheet
// styling logic all stay in exportExcel.js/exportInterviewExcel.js exactly
// as they were, since calibration and interview reports genuinely have
// different columns, different data, and different formatting rules.
// Moving those here would risk changing what either report actually looks
// like; this file only ever holds the parts that were truly identical.

export const COLORS = {
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

export const thinBorder = {
  top: { style: "thin", color: { argb: COLORS.border } },
  left: { style: "thin", color: { argb: COLORS.border } },
  bottom: { style: "thin", color: { argb: COLORS.border } },
  right: { style: "thin", color: { argb: COLORS.border } },
};

export function toLegacyDate(isoYmd) {
  if (!isoYmd) return "";
  const parts = String(isoYmd).split("-");
  if (parts.length !== 3) return isoYmd;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

export function todayLabel() {
  const d = new Date();
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${String(d.getDate()).padStart(2, "0")} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function triggerDownload(buffer, filename) {
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
// One shared promise here means whichever report the person visits first
// in a session "warms up" ExcelJS for the other one too, at no extra cost.
let exceljsLoadPromise = null;

export function ensureExcelJSLoaded() {
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
