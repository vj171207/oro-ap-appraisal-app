import { requireAuth } from "./authGuard.js";
import { db, collection, getDocs, orderBy, query } from "./firebase-config.js";
import { createReconcileState, reconcileList } from "./domReconcile.js";
import { buildDetailHtml, formatDateShort, escapeHtml } from "./calibrationRecordView.js";

async function main() {
  await requireAuth();

  const searchInput = document.getElementById("search-input");
  const statusEl = document.getElementById("search-status");
  const resultsEl = document.getElementById("search-results");
  const resultsReconcileState = createReconcileState();

  let allRecords = []; // fetched once, across every city — searching client-side over this is instant, no per-keystroke Firestore round-trip
  let loaded = false;

  async function loadAllRecords() {
    try {
      // Same single-field orderBy pattern as index.js's all-cities dashboard —
      // no composite index needed, and this is the exact same query already
      // running there, so it costs nothing extra architecturally.
      const q = query(collection(db, "calibrations"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      allRecords = [];
      snapshot.forEach((docSnap) => allRecords.push({ ...docSnap.data(), _docId: docSnap.id }));
      loaded = true;
      applySearch();
    } catch (err) {
      console.error(err);
      statusEl.textContent = "Couldn't load records. Check your connection and reload.";
    }
  }

  /** Case-insensitive substring match on name OR employee code — not fuzzy, spelling still matters. */
  function matches(record, needle) {
    const name = (record.apName || "").toLowerCase();
    const code = (record.apEmpCode || "").toLowerCase();
    return name.includes(needle) || code.includes(needle);
  }

  function applySearch() {
    const raw = searchInput.value.trim();

    if (!raw) {
      resultsEl.innerHTML = "";
      resultsReconcileState.nodesByKey.clear();
      resultsReconcileState.initialized = false;
      statusEl.textContent = loaded
        ? "Searches every city — start typing a name or code."
        : "Loading records…";
      return;
    }

    if (!loaded) {
      statusEl.textContent = "Still loading records — try again in a moment.";
      return;
    }

    const needle = raw.toLowerCase();
    const found = allRecords.filter((r) => matches(r, needle));

    statusEl.textContent = found.length === 0
      ? "No matches for that search."
      : `${found.length} match${found.length === 1 ? "" : "es"}.`;

    reconcileList(resultsEl, found, resultsReconcileState, {
      getKey: (d) => d._docId,
      buildRow: buildSearchResultRow,
      emptyMessageHtml: "", // status line above already communicates "no matches" — avoid a second, redundant message in the list area
    });
  }

  /** Collapsed row: name (+ code) as the primary text, city as a small badge to disambiguate same-named people across cities — click to expand the full record. Built once per record ever seen (domReconcile.js), not re-built on every keystroke. */
  function buildSearchResultRow(d) {
    const isPass = d.result === "Pass";
    const item = document.createElement("div");
    item.className = "history-item-expandable";

    const dateLabel = formatDateShort(d.testDate) || "—";

    item.innerHTML = `
      <button type="button" class="history-summary">
        <span class="ap-info">
          <span class="name">${escapeHtml(d.apName || "—")} - ${escapeHtml(d.apEmpCode || "—")}</span>
        </span>
        <span class="sl-badge">${escapeHtml(d.city || "—")}</span>
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

    return item;
  }

  // Live filtering as you type — data's already loaded client-side, so
  // filtering a few hundred/thousand plain objects by substring is
  // effectively instant. No debounce needed at this scale, no Apply button
  // needed either — this is the fastest and simplest option available.
  searchInput.addEventListener("input", applySearch);

  loadAllRecords();
}

main();
