import { db, collection, getDocs, query, where, orderBy } from "./firebase-config.js";
import { DATE_RANGE_OPTIONS, filterByDateRange, downloadSingleSheetWorkbook } from "./exportExcel.js";

const params = new URLSearchParams(window.location.search);
const city = params.get("city");

if (!city) {
  window.location.href = "index.html";
}

document.getElementById("city-title").textContent = city;
document.getElementById("new-calibration-link").href =
  `calibration.html?city=${encodeURIComponent(city)}`;

const historyEl = document.getElementById("history-list");
const statTotalEl = document.getElementById("stat-total");
const statPassEl = document.getElementById("stat-pass");
const statFailEl = document.getElementById("stat-fail");
const filterButtons = [...document.querySelectorAll(".filter-btn")];
const dateRangeSelect = document.getElementById("date-range-select");
const exportBtn = document.getElementById("export-btn");

const KARAT_SHORT = {
  "22K": "22K", "21K": "21K", "20K": "20K", "19K": "19K", "18K": "18K", "Below 18K": "<18K",
};

let allRecords = []; // fetched once, filtered/rendered client-side
let activeResultFilter = "all";
let activeDateRange = "all";

dateRangeSelect.innerHTML = DATE_RANGE_OPTIONS.map(
  (opt) => `<option value="${opt.value}">${opt.label}</option>`
).join("");

async function loadHistory() {
  try {
    const q = query(
      collection(db, "calibrations"),
      where("city", "==", city),
      orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);

    allRecords = [];
    snapshot.forEach((docSnap) => allRecords.push(docSnap.data()));

    renderAll();
  } catch (err) {
    console.error(err);
    historyEl.innerHTML = `<div class="empty-state">Couldn't load history. Check your connection and reload.</div>`;
  }
}

function getFilteredRecords() {
  let records = filterByDateRange(allRecords, activeDateRange);
  if (activeResultFilter !== "all") {
    records = records.filter((d) => d.result === activeResultFilter);
  }
  return records;
}

function renderAll() {
  renderStats();
  renderList();
}

function renderStats() {
  const total = allRecords.length;
  const passCount = allRecords.filter((d) => d.result === "Pass").length;
  const failCount = allRecords.filter((d) => d.result === "Fail").length;
  statTotalEl.textContent = total;
  statPassEl.textContent = passCount;
  statFailEl.textContent = failCount;
}

function renderList() {
  if (allRecords.length === 0) {
    historyEl.innerHTML = `<div class="empty-state">No calibrations recorded for ${city} yet. Start one above.</div>`;
    return;
  }

  const visible = getFilteredRecords();

  if (visible.length === 0) {
    historyEl.innerHTML = `<div class="empty-state">No results match the current filters.</div>`;
    return;
  }

  historyEl.innerHTML = "";

  visible.forEach((d) => {
    const isPass = d.result === "Pass";
    const item = document.createElement("div");
    item.className = "history-item-expandable";

    const dateLabel = formatDateShort(d.testDate) || "—";

    item.innerHTML = `
      <button type="button" class="history-summary">
        <span class="ap-info">
          <span class="name">${escapeHtml(d.apName || "—")} - ${escapeHtml(d.apEmpCode || "—")}</span>
        </span>
        <span class="history-date">${dateLabel}</span>
        <span class="result-icon ${isPass ? "pass" : "fail"}">${isPass ? "✓" : "✗"}</span>
        <span class="chevron">&rsaquo;</span>
      </button>
      <div class="history-detail" hidden></div>
    `;

    const detailEl = item.querySelector(".history-detail");
    const summaryBtn = item.querySelector(".history-summary");
    let rendered = false;

    summaryBtn.addEventListener("click", () => {
      const isHidden = detailEl.hasAttribute("hidden");
      if (isHidden) {
        if (!rendered) {
          detailEl.innerHTML = buildDetailHtml(d);
          rendered = true;
        }
        detailEl.removeAttribute("hidden");
        item.classList.add("expanded");
      } else {
        detailEl.setAttribute("hidden", "");
        item.classList.remove("expanded");
      }
    });

    historyEl.appendChild(item);
  });
}

filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    activeResultFilter = btn.dataset.filter;
    filterButtons.forEach((b) => b.classList.toggle("active", b === btn));
    renderList();
  });
});

dateRangeSelect.addEventListener("change", () => {
  activeDateRange = dateRangeSelect.value;
  renderList();
});

exportBtn.addEventListener("click", () => {
  const records = getFilteredRecords();
  if (records.length === 0) {
    alert("No records match the current filters — nothing to export.");
    return;
  }
  const rangeLabel = DATE_RANGE_OPTIONS.find((o) => o.value === activeDateRange)?.label.replace(/\s+/g, "") || "All";
  const resultLabel = activeResultFilter === "all" ? "" : `_${activeResultFilter}`;
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `${city}_${rangeLabel}${resultLabel}_${dateStamp}.xlsx`;
  downloadSingleSheetWorkbook(records, city, filename);
});

function buildDetailHtml(d) {
  const needleRows = (d.needles || [])
    .map((n, i) => {
      const scoreLabel = n.score === null || n.score === undefined ? "—" : `${n.score} pt${n.score === 1 ? "" : "s"}`;
      return `
        <tr>
          <td>Needle ${i + 1}</td>
          <td>${escapeHtml(KARAT_SHORT[n.given] || n.given || "—")}</td>
          <td>${escapeHtml(KARAT_SHORT[n.answer] || n.answer || "—")}</td>
          <td>${scoreLabel}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="detail-grid">
      <div><span class="detail-label">Score</span>${d.totalScore ?? "—"}/10</div>
      <div><span class="detail-label">Audited by</span>${escapeHtml(d.auditorName || "—")} (${escapeHtml(d.auditorEmpCode || "—")})</div>
      <div><span class="detail-label">AP Date of Joining</span>${escapeHtml(formatDateLong(d.apDoj) || "—")}</div>
      ${d.autoFailTriggered ? `<div class="autofail-note-inline">Auto-fail: a Below 18K needle was missed</div>` : ""}
    </div>
    <table class="needle-table">
      <thead>
        <tr><th>Needle</th><th>Known</th><th>AP Answer</th><th>Score</th></tr>
      </thead>
      <tbody>${needleRows}</tbody>
    </table>
    ${d.remarks ? `<div class="remarks-block"><span class="detail-label">Remarks</span>${escapeHtml(d.remarks)}</div>` : ""}
  `;
}

/** DD/MM/YY, for the compact collapsed row. */
function formatDateShort(isoYmd) {
  if (!isoYmd) return "";
  const parts = String(isoYmd).split("-");
  if (parts.length !== 3) return "";
  const [y, m, day] = parts;
  return `${day}/${m}/${y.slice(-2)}`;
}

/** "1 Jun 2026", for the expanded detail panel. */
function formatDateLong(isoYmd) {
  if (!isoYmd) return "";
  const parts = String(isoYmd).split("-");
  if (parts.length !== 3) return isoYmd;
  const [y, m, day] = parts;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const mi = parseInt(m, 10) - 1;
  if (mi < 0 || mi > 11) return isoYmd;
  return `${day} ${months[mi]} ${y}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

loadHistory();
