import { requireAuth } from "./authGuard.js";
import { db, collection, getDocs, orderBy, query } from "./firebase-config.js";
import { classifyDecision } from "./interviewStats.js";
import { createReconcileState, reconcileList } from "./domReconcile.js";
import { buildDetailHtml, formatDateShort, escapeHtml } from "./interviewRecordView.js";

async function main() {
  await requireAuth();

  const searchInput = document.getElementById("search-input");
  const statusEl = document.getElementById("search-status");
  const resultsEl = document.getElementById("search-results");
  const resultsReconcileState = createReconcileState();

  let allRecords = []; // fetched once, across every city
  let loaded = false;

  async function loadAllRecords() {
    try {
      // Same single-field orderBy pattern as interview.js's all-cities dashboard.
      const q = query(collection(db, "interview_entries"), orderBy("createdAt", "desc"));
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

  /** Case-insensitive substring match on candidate name — not fuzzy, spelling still matters. */
  function matches(record, needle) {
    return (record.candidateName || "").toLowerCase().includes(needle);
  }

  function applySearch() {
    const raw = searchInput.value.trim();

    if (!raw) {
      resultsEl.innerHTML = "";
      resultsReconcileState.nodesByKey.clear();
      resultsReconcileState.initialized = false;
      statusEl.textContent = loaded
        ? "Searches every city — start typing a name."
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
      emptyMessageHtml: "",
    });
  }

  /** Collapsed row: candidate name as primary text, city as a small badge to disambiguate same-named candidates across cities — click to expand the full record. Built once per record ever seen (domReconcile.js). */
  function buildSearchResultRow(d) {
    const outcome = classifyDecision(d.round1Decision);
    const isSelected = outcome === "Selected";
    const isRejected = outcome === "Rejected";
    const item = document.createElement("div");
    item.className = "history-item-expandable";

    const dateLabel = formatDateShort(d.interviewDate) || "—";
    const iconClass = isSelected ? "pass" : isRejected ? "fail" : "";
    const icon = isSelected ? "✓" : isRejected ? "✗" : "•";

    item.innerHTML = `
      <button type="button" class="history-summary">
        <span class="ap-info">
          <span class="name">${escapeHtml(d.candidateName || "—")}</span>
        </span>
        <span class="sl-badge">${escapeHtml(d.city || "—")}</span>
        <span class="history-date">${dateLabel}</span>
        <span class="result-icon ${iconClass}">${icon}</span>
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

  searchInput.addEventListener("input", applySearch);

  loadAllRecords();
}

main();
