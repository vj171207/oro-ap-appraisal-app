import { requireAuth } from "./authGuard.js";
import { getCities } from "./cities.js";
import { db, collection, getDocs, query, where } from "./firebase-config.js";
import { QUICK_RANGE_OPTIONS, getQuickRangeDates, classifyDecision } from "./interviewStats.js";

async function main() {
  await requireAuth();

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  const listEl = document.getElementById("city-list");
  const cities = await getCities();

  cities.forEach((city) => {
    const row = document.createElement("a");
    row.href = `interview-city.html?city=${encodeURIComponent(city)}`;
    row.className = "city-row";
    row.innerHTML = `
      <span class="name">${escapeHtml(city)}</span>
      <span class="arrow">&rarr;</span>
    `;
    listEl.appendChild(row);
  });

  // ---- Overall dashboard (Total/Selected/Rejected/Selection Rate across every city) ----
  //
  // This used to fetch every interview_entries document in the whole
  // collection on every load, regardless of the date range selected. It's
  // NOT converted to count() aggregation the way calibration-home.js was:
  // `round1Decision` is free text on legacy records (classifyDecision()
  // exists specifically to correctly bucket older phrasings like "Ok for
  // the next level" as Selected) — an equality-based count query would
  // silently miscount exactly those legacy records again, the same bug
  // already found and fixed once.
  //
  // Instead, the fetch itself is now narrowed to the selected date range
  // via a server-side `where` on interviewDate, so the read cost tracks
  // what's actually being viewed instead of the entire history — "All
  // time" still reads everything, but any bounded range (e.g. "Last 3
  // months") only reads that window. Classification logic is unchanged
  // and still runs client-side on whatever comes back, so results are
  // identical to before, just cheaper to produce for a bounded range.
  //
  // A single inequality filter on one field (interviewDate) never needs a
  // composite index, so no Firestore Console setup is required for this.

  const statTotalEl = document.getElementById("stat-total");
  const statSelectedEl = document.getElementById("stat-selected");
  const statRejectedEl = document.getElementById("stat-rejected");
  const statRateEl = document.getElementById("stat-rate");
  const decisionFilterSelect = document.getElementById("decision-filter-select");
  const quickRangeSelect = document.getElementById("quick-range-select");
  const fromDateInput = document.getElementById("from-date-input");
  const toDateInput = document.getElementById("to-date-input");
  const applyBtn = document.getElementById("apply-filters-btn");

  quickRangeSelect.innerHTML = QUICK_RANGE_OPTIONS.map(
    (opt) => `<option value="${opt.value}">${opt.label}</option>`
  ).join("");

  quickRangeSelect.addEventListener("change", () => {
    const dates = getQuickRangeDates(quickRangeSelect.value);
    fromDateInput.value = dates.from;
    toDateInput.value = dates.to;
  });

  // Guards against a race: if the user changes filters and clicks Apply
  // again before the first round trip finishes, only the most recent
  // request is allowed to write to the stat elements.
  let requestSeq = 0;

  async function applyFilters() {
    const from = fromDateInput.value;
    const to = toDateInput.value;
    const decisionFilter = decisionFilterSelect.value; // "all" | "Selected" | "Rejected"
    const mySeq = ++requestSeq;

    try {
      const dateConstraints = [];
      if (from) dateConstraints.push(where("interviewDate", ">=", from));
      if (to) dateConstraints.push(where("interviewDate", "<=", to));

      const q = query(collection(db, "interview_entries"), ...dateConstraints);
      const snapshot = await getDocs(q);
      if (mySeq !== requestSeq) return; // superseded by a newer request

      const records = [];
      snapshot.forEach((docSnap) => records.push(docSnap.data()));

      const total = records.length; // always the full date-range count — never narrowed by the Decision filter

      let selectedCount, rejectedCount;

      if (decisionFilter === "Selected") {
        selectedCount = records.filter((d) => classifyDecision(d.round1Decision) === "Selected").length;
        rejectedCount = 0;
      } else if (decisionFilter === "Rejected") {
        selectedCount = 0;
        rejectedCount = records.filter((d) => classifyDecision(d.round1Decision) === "Rejected").length;
      } else {
        selectedCount = records.filter((d) => classifyDecision(d.round1Decision) === "Selected").length;
        rejectedCount = records.filter((d) => classifyDecision(d.round1Decision) === "Rejected").length;
      }

      const selectionRate = total > 0 ? ((selectedCount / total) * 100).toFixed(1) : "—";
      statTotalEl.textContent = total;
      statSelectedEl.textContent = selectedCount;
      statRejectedEl.textContent = rejectedCount;
      statRateEl.textContent = selectionRate === "—" ? "—" : `${selectionRate}%`;
    } catch (err) {
      console.error(err);
      statTotalEl.textContent = "—";
      statSelectedEl.textContent = "—";
      statRejectedEl.textContent = "—";
      statRateEl.textContent = "—";
    }
  }

  applyBtn.addEventListener("click", applyFilters);

  applyFilters();
}

main();
