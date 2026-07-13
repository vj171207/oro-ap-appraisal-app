import { requireAuth } from "./authGuard.js";
import { showErrorToast } from "./toast.js";
import { scoreNeedle, computeResult } from "./scoring.js";
import { karatStripHtml, optionsHtml } from "./needleUI.js";
import { db, collection, addDoc, serverTimestamp, doc, getDoc } from "./firebase-config.js";

// Flip to false to stop requiring every field on this form (except
// Remarks, which stays optional either way). Needle Known Value/AP Answer
// are unaffected by this toggle — those are checked unconditionally,
// separately, since the score literally can't be computed without them.
const ENFORCE_ALL_FIELDS_REQUIRED = true;

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

  function setDefaultTestDate() {
    const testDateInput = document.getElementById("testDate");
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    testDateInput.value = iso; // pre-filled, but a normal <input type="date"> — freely editable
  }

  setDefaultTestDate();

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

    // ---- Mandatory-field validation ----------------------------------
    // Set ENFORCE_ALL_FIELDS_REQUIRED to false (or delete this block down
    // to the closing "// --------" marker) to remove this requirement
    // entirely — the form will then submit with any of these fields left
    // blank, same as before this was added.
    //
    // Needle given/answer are checked separately below, UNCONDITIONALLY —
    // those aren't part of the "make every field mandatory" request, they
    // were already required because scoreNeedle()/computeResult() can't
    // run without them. Remarks stays optional either way — it's freeform
    // notes, not a data field.
    const missing = [];

    if (ENFORCE_ALL_FIELDS_REQUIRED) {
      if (!document.getElementById("testDate").value) missing.push("Test Date");
      if (!document.getElementById("auditorName").value.trim()) missing.push("Audit Official Name");
      if (!document.getElementById("auditorEmpCode").value.trim()) missing.push("Auditor Emp Code");
      if (!document.getElementById("apEmpCode").value.trim()) missing.push("AP Employee Code");
      if (!document.getElementById("apName").value.trim()) missing.push("AP Name");
      if (!document.getElementById("apDoj").value) missing.push("Date of Joining");
    }
    // --------------------------------------------------------------------

    const needleCards = [...container.querySelectorAll(".needle-card")];
    const needleData = [];
    let needleGapFound = false;

    for (const card of needleCards) {
      const given = card.querySelector(".given-select").value;
      const answer = card.querySelector(".answer-select").value;
      if (!given || !answer) {
        needleGapFound = true;
        continue;
      }
      const { score, autoFail } = scoreNeedle(given, answer);
      needleData.push({ given, answer, score, autoFail });
    }

    if (needleGapFound) {
      missing.push("every needle's Known Value and AP Answer");
    }

    if (missing.length > 0) {
      showErrorToast(`Please fill in: ${missing.join(", ")}.`);
      return;
    }

    const { totalScore, autoFailTriggered, result } = computeResult(needleData);

    const testDate = document.getElementById("testDate").value; // already "YYYY-MM-DD"
    const [year, month] = testDate.split("-");
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
      showErrorToast("Couldn't save this calibration. Check your connection and try again.");
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
