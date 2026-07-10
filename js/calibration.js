import { requireAuth } from "./authGuard.js";
import { showErrorToast } from "./toast.js";
import { KARAT_OPTIONS, scoreNeedle, computeResult } from "./scoring.js";
import { db, collection, addDoc, serverTimestamp, doc, getDoc } from "./firebase-config.js";

async function main() {
  await requireAuth();

  const params = new URLSearchParams(window.location.search);
  const city = params.get("city");

  if (!city) {
    window.location.href = "index.html";
  }

  document.getElementById("city-eyebrow").textContent = `Oro · ${city}`;
  document.getElementById("back-link").href = `city.html?city=${encodeURIComponent(city)}`;

  const NEEDLE_COUNT = 5;

  const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  function populateDateDropdowns() {
    const daySelect = document.getElementById("testDay");
    const monthSelect = document.getElementById("testMonth");
    const yearSelect = document.getElementById("testYear");

    daySelect.innerHTML =
      `<option value="" disabled selected>Day</option>` +
      Array.from({ length: 31 }, (_, i) => i + 1)
        .map((d) => `<option value="${d}">${String(d).padStart(2, "0")}</option>`)
        .join("");

    monthSelect.innerHTML =
      `<option value="" disabled selected>Month</option>` +
      MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("");

    const currentYear = new Date().getFullYear();
    const years = [];
    for (let y = currentYear - 3; y <= currentYear + 1; y++) years.push(y);
    yearSelect.innerHTML =
      `<option value="" disabled selected>Year</option>` +
      years.map((y) => `<option value="${y}">${y}</option>`).join("");
  }

  populateDateDropdowns();

  // ---- Auditor dropdown (config/auditors, managed via Settings) ----

  const auditorNameSelect = document.getElementById("auditorName");
  const auditorEmpCodeInput = document.getElementById("auditorEmpCode");
  let auditorList = [];

  async function loadAuditors() {
    try {
      const snap = await getDoc(doc(db, "config", "auditors"));
      const rawList = snap.exists() && Array.isArray(snap.data().list) ? snap.data().list : [];
      auditorList = rawList.filter(
        (a) =>
          a &&
          typeof a === "object" &&
          typeof a.name === "string" &&
          a.name.trim().length > 0 &&
          typeof a.empCode === "string" &&
          a.empCode.trim().length > 0
      );
    } catch (err) {
      console.error("Couldn't load auditor list.", err);
      auditorList = [];
    }

    auditorNameSelect.innerHTML =
      `<option value="" disabled selected>Select…</option>` +
      auditorList
        .map((a) => `<option value="${escapeHtml(a.name)}">${escapeHtml(a.name)}</option>`)
        .join("");
  }

  auditorNameSelect.addEventListener("change", () => {
    const match = auditorList.find((a) => a.name === auditorNameSelect.value);
    auditorEmpCodeInput.value = match ? match.empCode : "";
  });

  loadAuditors();

  // ---- AP roster lookup (from the synced Google Sheet, via Firestore) ----

  const apEmpCodeInput = document.getElementById("apEmpCode");
  const apNameInput = document.getElementById("apName");
  const apDojInput = document.getElementById("apDoj");
  const lookupStatus = document.getElementById("ap-lookup-status");

  async function lookupAP() {
    const rawCode = apEmpCodeInput.value.trim();
    if (!rawCode) {
      lookupStatus.textContent = "";
      lookupStatus.className = "lookup-status";
      return;
    }

    lookupStatus.textContent = "Looking up…";
    lookupStatus.className = "lookup-status loading";

    // Try the code as typed, then uppercased, in case of casing mismatches
    // against the roster (Firestore document lookups are case-sensitive).
    const candidates = [...new Set([rawCode, rawCode.toUpperCase()])];
    let found = null;

    for (const code of candidates) {
      try {
        const snap = await getDoc(doc(db, "appraisal_partners", code));
        if (snap.exists()) {
          found = snap.data();
          break;
        }
      } catch (err) {
        console.error(err);
      }
    }

    if (found) {
      const apLocation = (found.location || "").trim().toLowerCase();
      const pageCity = (city || "").trim().toLowerCase();

      if (apLocation && apLocation !== pageCity) {
        // Found in the roster, but registered under a different city —
        // don't autofill, and don't let this look like a silent success.
        apNameInput.value = "";
        apDojInput.value = "";
        lookupStatus.textContent = `Not found in ${city}'s roster — this code belongs to ${found.location}.`;
        lookupStatus.className = "lookup-status not-found";
        showErrorToast(`Not found in ${city}. This AP (${found.name || rawCode}) is registered under ${found.location}. Check the code.`);
        return;
      }

      apNameInput.value = found.name || "";
      if (found.doj) apDojInput.value = found.doj;
      const locationNote = found.location ? ` · ${found.location}` : "";
      lookupStatus.textContent = `✓ Found in roster${locationNote}`;
      lookupStatus.className = "lookup-status found";
    } else {
      apNameInput.value = "";
      apDojInput.value = "";
      lookupStatus.textContent = "Not found in roster — check the code, or enter name/DOJ manually.";
      lookupStatus.className = "lookup-status not-found";
    }
  }

  apEmpCodeInput.addEventListener("blur", lookupAP);

  // ---- Toast for higher-visibility errors (e.g. cross-city AP lookup) ----

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // Evenly space karat options across the strip with a small inner margin
  // so end markers don't get clipped by the circle's own radius.
  function karatPercent(value) {
    const idx = KARAT_OPTIONS.indexOf(value);
    const margin = 6;
    const usable = 100 - margin * 2;
    return margin + (idx / (KARAT_OPTIONS.length - 1)) * usable;
  }

  function karatStripHtml(given, answer) {
    const ticks = KARAT_OPTIONS.map((opt) => {
      const pct = karatPercent(opt);
      const shortLabel = opt === "Below 18K" ? "<18" : opt.replace("K", "");
      return `<span class="tick-label" style="left:${pct}%">${shortLabel}</span>`;
    }).join("");

    const givenMarker = given
      ? `<span class="marker given" style="left:${karatPercent(given)}%" title="Known: ${given}"></span>`
      : "";
    const answerMarker = answer
      ? `<span class="marker answer" style="left:${karatPercent(answer)}%" title="AP answer: ${answer}"></span>`
      : "";

    return `
      <div class="karat-strip">
        <div class="track"></div>
        ${ticks}
        ${givenMarker}
        ${answerMarker}
      </div>
    `;
  }

  function optionsHtml(selected) {
    return (
      `<option value="" disabled ${!selected ? "selected" : ""}>Select…</option>` +
      KARAT_OPTIONS.map(
        (opt) => `<option value="${opt}" ${opt === selected ? "selected" : ""}>${opt}</option>`
      ).join("")
    );
  }

  const container = document.getElementById("needles-container");

  for (let i = 1; i <= NEEDLE_COUNT; i++) {
    const card = document.createElement("div");
    card.className = "needle-card";
    card.dataset.needleIndex = i;
    card.innerHTML = `
      <div class="needle-title">NEEDLE ${i}</div>
      <div class="needle-selects">
        <div class="field" style="margin-bottom: 0;">
          <label>Known value (given to AP)</label>
          <select class="given-select">${optionsHtml("")}</select>
        </div>
        <div class="field" style="margin-bottom: 0;">
          <label>AP's answer</label>
          <select class="answer-select">${optionsHtml("")}</select>
        </div>
      </div>
      <div class="strip-container"></div>
      <div class="needle-score">
        <span class="label">Score</span>
        <span><span class="score-pill" style="display:none;"></span><span class="autofail-tag" style="display:none;">Auto-fail</span></span>
      </div>
    `;
    container.appendChild(card);

    const givenSelect = card.querySelector(".given-select");
    const answerSelect = card.querySelector(".answer-select");
    const stripContainer = card.querySelector(".strip-container");
    const scorePill = card.querySelector(".score-pill");
    const autofailTag = card.querySelector(".autofail-tag");

    function update() {
      const given = givenSelect.value;
      const answer = answerSelect.value;
      stripContainer.innerHTML = karatStripHtml(given, answer);

      if (given && answer) {
        const { score, autoFail } = scoreNeedle(given, answer);
        scorePill.style.display = "inline-block";
        scorePill.textContent = `${score} pt${score === 1 ? "" : "s"}`;
        scorePill.className = `score-pill score-${score}`;
        autofailTag.style.display = autoFail ? "inline-block" : "none";
      } else {
        scorePill.style.display = "none";
        autofailTag.style.display = "none";
      }
    }

    givenSelect.addEventListener("change", update);
    answerSelect.addEventListener("change", update);
    update();
  }

  const form = document.getElementById("calibration-form");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const needleCards = [...container.querySelectorAll(".needle-card")];
    const needleData = [];

    for (const card of needleCards) {
      const given = card.querySelector(".given-select").value;
      const answer = card.querySelector(".answer-select").value;
      if (!given || !answer) {
        alert("Please fill in every needle's known value and AP answer before submitting.");
        return;
      }
      const { score, autoFail } = scoreNeedle(given, answer);
      needleData.push({ given, answer, score, autoFail });
    }

    const { totalScore, autoFailTriggered, result } = computeResult(needleData);

    const day = document.getElementById("testDay").value;
    const month = document.getElementById("testMonth").value;
    const year = document.getElementById("testYear").value;

    if (!day || !month || !year) {
      alert("Please select the full test date (day, month, and year).");
      return;
    }

    const testDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const monthYearLabel = `${MONTHS[Number(month) - 1]} ${year}`;

    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving…";

    try {
      await addDoc(collection(db, "calibrations"), {
        city,
        testDate,
        monthYearLabel,
        auditorName: document.getElementById("auditorName").value.trim(),
        auditorEmpCode: document.getElementById("auditorEmpCode").value.trim(),
        apName: document.getElementById("apName").value.trim(),
        apEmpCode: document.getElementById("apEmpCode").value.trim(),
        apDoj: document.getElementById("apDoj").value,
        needles: needleData.map(({ given, answer, score }) => ({ given, answer, score })),
        totalScore,
        autoFailTriggered,
        result,
        remarks: document.getElementById("remarks").value.trim(),
        createdAt: serverTimestamp(),
      });

      showResult(totalScore, result, autoFailTriggered);
    } catch (err) {
      console.error(err);
      alert("Couldn't save this calibration. Check your connection and try again.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit calibration";
    }
  });

  function showResult(totalScore, result, autoFailTriggered) {
    form.style.display = "none";
    const resultView = document.getElementById("result-view");
    resultView.style.display = "block";

    const banner = document.getElementById("result-banner");
    banner.className = `result-banner ${result === "Pass" ? "pass" : "fail"}`;
    document.getElementById("result-word").textContent = result;
    document.getElementById("result-score").textContent = `Score: ${totalScore} / 10`;
    document.getElementById("autofail-note").style.display = autoFailTriggered ? "block" : "none";

    document.getElementById("view-city-link").href = `city.html?city=${encodeURIComponent(city)}`;
    document.getElementById("new-calibration-again-link").href = `calibration.html?city=${encodeURIComponent(city)}`;

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

}

main();
