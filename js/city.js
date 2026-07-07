import { db, collection, getDocs, query, where, orderBy } from "./firebase-config.js";

const params = new URLSearchParams(window.location.search);
const city = params.get("city");

if (!city) {
  window.location.href = "index.html";
}

document.getElementById("city-title").textContent = city;
document.getElementById("new-calibration-link").href =
  `calibration.html?city=${encodeURIComponent(city)}`;

const historyEl = document.getElementById("history-list");

const KARAT_SHORT = {
  "22K": "22K", "21K": "21K", "20K": "20K", "19K": "19K", "18K": "18K", "Below 18K": "<18K",
};

async function loadHistory() {
  try {
    const q = query(
      collection(db, "calibrations"),
      where("city", "==", city),
      orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      historyEl.innerHTML = `<div class="empty-state">No calibrations recorded for ${city} yet. Start one above.</div>`;
      return;
    }

    historyEl.innerHTML = "";
    const total = snapshot.size;
    let idx = 0;

    snapshot.forEach((docSnap) => {
      const d = docSnap.data();
      const sl = total - idx; // newest = highest SL, matching the original sheet's running count
      idx++;

      const resultClass = d.result === "Pass" ? "pass" : "fail";
      const item = document.createElement("div");
      item.className = "history-item-expandable";

      const dateLabel = formatDate(d.testDate) || d.monthYearLabel || "—";

      item.innerHTML = `
        <button type="button" class="history-summary">
          <span class="sl-badge">#${sl}</span>
          <span class="ap-info">
            <span class="name">${escapeHtml(d.apName || "—")}</span>
            <span class="meta">${escapeHtml(d.apEmpCode || "—")} · ${escapeHtml(dateLabel)} · Score ${d.totalScore ?? "—"}/10</span>
          </span>
          <span class="result-tag ${resultClass}">${d.result}</span>
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
  } catch (err) {
    console.error(err);
    historyEl.innerHTML = `<div class="empty-state">Couldn't load history. Check your connection and reload.</div>`;
  }
}

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
      <div><span class="detail-label">Audited by</span>${escapeHtml(d.auditorName || "—")} (${escapeHtml(d.auditorEmpCode || "—")})</div>
      <div><span class="detail-label">AP Date of Joining</span>${escapeHtml(formatDate(d.apDoj) || "—")}</div>
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

function formatDate(isoOrYmd) {
  if (!isoOrYmd) return "";
  const parts = String(isoOrYmd).split("-");
  if (parts.length !== 3) return isoOrYmd;
  const [y, m, day] = parts;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const mi = parseInt(m, 10) - 1;
  if (mi < 0 || mi > 11) return isoOrYmd;
  return `${day} ${months[mi]} ${y}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

loadHistory();
