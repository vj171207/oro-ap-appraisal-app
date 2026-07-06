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
    snapshot.forEach((doc) => {
      const d = doc.data();
      const resultClass = d.result === "Pass" ? "pass" : "fail";
      const item = document.createElement("div");
      item.className = "history-item";
      item.innerHTML = `
        <div class="ap-info">
          <div class="name">${escapeHtml(d.apName || "—")}</div>
          <div class="meta">${escapeHtml(d.apEmpCode || "—")} · ${escapeHtml(d.monthYear || "—")} · Score ${d.totalScore ?? "—"}/10</div>
        </div>
        <span class="result-tag ${resultClass}">${d.result}</span>
      `;
      historyEl.appendChild(item);
    });
  } catch (err) {
    console.error(err);
    historyEl.innerHTML = `<div class="empty-state">Couldn't load history. Check your connection and reload.</div>`;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

loadHistory();
