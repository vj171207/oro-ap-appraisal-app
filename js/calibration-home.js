import { requireAuth } from "./authGuard.js";
import { getCities } from "./cities.js";
import { db, collection, query, where, getCountFromServer } from "./firebase-config.js";
import { QUICK_RANGE_OPTIONS, getQuickRangeDates } from "./calibration-exportExcel.js";

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
    row.href = `calibration-city.html?city=${encodeURIComponent(city)}`;
    row.className = "city-row";
    row.innerHTML = `
      <span class="name">${escapeHtml(city)}</span>
      <span class="arrow">&rarr;</span>
    `;
    listEl.appendChild(row);
  });

  // ---- All-cities dashboard (Total/Pass/Fail across every city) ----
  //
  // This used to fetch every calibration document in the whole collection
  // on every load, then count Pass/Fail/date-window matches in JS. That
  // read cost scaled with total historical record count, not with what's
  // actually being displayed (four numbers).
  //
  // Now it uses Firestore's count() aggregation query instead — the server
  // returns a match count without transferring the documents themselves.
  // This is safe to do exactly because `result` is a strict Pass/Fail enum
  // enforced by firestore.rules (see the calibrations `create` rule): an
  // equality match on `result` can never disagree with what a full fetch
  // would have counted, unlike AP Interview's free-text `round1Decision`
  // field (see interview.js for why that one is handled differently).
  //
  // NOTE: combining a date-range filter (testDate) with a result-equality
  // filter (result) in the same query requires a Firestore composite
  // index. This has been created via Firebase Console:
  //   Collection: calibrations
  //   Fields: result (Ascending), testDate (Ascending)
  // If this index is ever deleted, applying any date range together with
  // the Pass/Fail dropdown will throw a "query requires an index" error
  // with a direct Console link to recreate it — the fix is just clicking
  // that link. Every other query shape used here (no filters, or a single
  // filter alone) does not need this index at all.

  const statTotalEl = document.getElementById("stat-total");
  const statPassEl = document.getElementById("stat-pass");
  const statFailEl = document.getElementById("stat-fail");
  const statClearanceEl = document.getElementById("stat-clearance");
  const resultFilterSelect = document.getElementById("result-filter-select");
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
    const resultFilter = resultFilterSelect.value; // "all" | "Pass" | "Fail"
    const mySeq = ++requestSeq;

    try {
      const dateConstraints = [];
      if (from) dateConstraints.push(where("testDate", ">=", from));
      if (to) dateConstraints.push(where("testDate", "<=", to));

      // Total is always the full date-range count, never narrowed by the
      // Result dropdown — same rule the old client-side version followed.
      const totalSnap = await getCountFromServer(
        query(collection(db, "calibrations"), ...dateConstraints)
      );
      if (mySeq !== requestSeq) return; // superseded by a newer request

      const total = totalSnap.data().count;

      let passCount = 0;
      let failCount = 0;

      if (resultFilter !== "Fail") {
        const passSnap = await getCountFromServer(
          query(collection(db, "calibrations"), ...dateConstraints, where("result", "==", "Pass"))
        );
        if (mySeq !== requestSeq) return;
        passCount = passSnap.data().count;
      }

      if (resultFilter !== "Pass") {
        const failSnap = await getCountFromServer(
          query(collection(db, "calibrations"), ...dateConstraints, where("result", "==", "Fail"))
        );
        if (mySeq !== requestSeq) return;
        failCount = failSnap.data().count;
      }

      const clearance = total > 0 ? ((passCount / total) * 100).toFixed(1) : "—";
      statTotalEl.textContent = total;
      statPassEl.textContent = passCount;
      statFailEl.textContent = failCount;
      statClearanceEl.textContent = clearance === "—" ? "—" : `${clearance}%`;
    } catch (err) {
      console.error(err);
      statTotalEl.textContent = "—";
      statPassEl.textContent = "—";
      statFailEl.textContent = "—";
      statClearanceEl.textContent = "—";
    }
  }

  applyBtn.addEventListener("click", applyFilters);

  applyFilters();
}

main();
