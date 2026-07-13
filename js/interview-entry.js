import { requireAuth } from "./authGuard.js";
import { showErrorToast } from "./toast.js";
import { db, collection, addDoc, serverTimestamp } from "./firebase-config.js";
import { scoreNeedle } from "./scoring.js";
import { karatStripHtml, optionsHtml } from "./needleUI.js";

// Flip to false to stop requiring every field on this form. Remarks and
// Location (optional detail) stay exempt either way — Remarks is freeform
// notes, and Location is only meaningful when the candidate's actual
// location differs from the city itself (the form leaves it blank
// on purpose when it doesn't).
const ENFORCE_ALL_FIELDS_REQUIRED = true;

// City -> local language shown on the form, mirroring the per-city language
// column already used in the source spreadsheet (Kannada tab for Bengaluru,
// Tamil for Chennai, etc). Any city not listed here (e.g. a brand-new one
// added later via Settings) falls back to a generic "Local Language" label
// rather than breaking.
const LOCAL_LANGUAGE_BY_CITY = {
  "Bengaluru": "Kannada",
  "Chennai": "Tamil",
  "Hyderabad": "Telugu",
  "Pune": "Marathi/Hindi",
  "Vijayawada": "Telugu",
  "Guntur": "Telugu",
  "Warangal": "Telugu",
  "Karimnagar": "Telugu",
};

async function main() {
  await requireAuth();

  const params = new URLSearchParams(window.location.search);
  const city = params.get("city");

  if (!city) {
    window.location.href = "interview.html";
    return;
  }

  document.getElementById("city-eyebrow").textContent = `Oro · ${city}`;

  const localLanguage = LOCAL_LANGUAGE_BY_CITY[city] || "Local Language";
  document.getElementById("localLanguageLabel").textContent = `${localLanguage} Proficiency`;

  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  document.getElementById("interviewDate").value = todayIso; // pre-filled, but a normal <input type="date"> — freely editable

  // ---- Practical Score — needle-by-needle popup ----------------------
  // Same scoring mechanism as AP Calibration (scoreNeedle from scoring.js,
  // karatStripHtml/optionsHtml from needleUI.js — literally the same code,
  // not a lookalike copy), just 3 needles instead of 5: 3 x 2pts max = 6,
  // matching "Practical Score (out of 6)" exactly.
  const PRACTICAL_NEEDLE_COUNT = 3;

  const scoreTheoryInput = document.getElementById("scoreTheory");
  const scorePracticalInput = document.getElementById("scorePractical");
  const totalScoreInput = document.getElementById("totalScore");
  const practicalCardBtn = document.getElementById("practical-score-card");
  const practicalCardLabel = document.getElementById("practical-score-card-label");
  const practicalModalOverlay = document.getElementById("practical-modal-overlay");
  const practicalNeedlesContainer = document.getElementById("practical-needles-container");
  const practicalModalCancelBtn = document.getElementById("practical-modal-cancel-btn");
  const practicalModalSaveBtn = document.getElementById("practical-modal-save-btn");

  // Kept here (not just in the DOM) so re-opening the popup to edit an
  // already-scored entry shows what was previously picked, rather than
  // resetting every needle back to blank.
  let practicalNeedleSelections = Array.from({ length: PRACTICAL_NEEDLE_COUNT }, () => ({ given: "", answer: "" }));
  // The saved per-needle result, once Save has been clicked at least once —
  // stored alongside the entry for the same audit-detail reasons AP
  // Calibration stores its own `needles` array. Stays null until scored.
  let practicalNeedleResults = null;

  /** Total Score is always Theory + Practical, never typed in directly — recomputed whenever either input changes. */
  function recomputeTotal() {
    const theoryRaw = scoreTheoryInput.value;
    const practicalRaw = scorePracticalInput.value;
    totalScoreInput.value = theoryRaw === "" || practicalRaw === "" ? "" : String(Number(theoryRaw) + Number(practicalRaw));
  }

  scoreTheoryInput.addEventListener("input", recomputeTotal);

  function updatePracticalCardLabel() {
    if (scorePracticalInput.value === "") {
      practicalCardLabel.textContent = "Click to begin";
      practicalCardBtn.classList.remove("scored");
    } else {
      practicalCardLabel.textContent = `Score: ${scorePracticalInput.value} / 6 · Edit`;
      practicalCardBtn.classList.add("scored");
    }
  }

  /** Rebuilds the 3 needle cards inside the popup from the current selections (blank on first open, pre-filled if re-editing). */
  function renderPracticalNeedles() {
    practicalNeedlesContainer.innerHTML = "";
    for (let i = 0; i < PRACTICAL_NEEDLE_COUNT; i++) {
      const sel = practicalNeedleSelections[i];
      const card = document.createElement("div");
      card.className = "needle-card";
      card.dataset.needleIndex = i;
      card.innerHTML = `
        <div class="needle-title">NEEDLE ${i + 1}</div>
        <div class="needle-selects">
          <div class="field" style="margin-bottom: 0;">
            <label>Known value (given to candidate)</label>
            <select class="given-select">${optionsHtml(sel.given)}</select>
          </div>
          <div class="field" style="margin-bottom: 0;">
            <label>Candidate's answer</label>
            <select class="answer-select">${optionsHtml(sel.answer)}</select>
          </div>
        </div>
        <div class="strip-container"></div>
        <div class="needle-score">
          <span class="label">Score</span>
          <span><span class="score-pill" style="display:none;"></span></span>
        </div>
      `;
      practicalNeedlesContainer.appendChild(card);

      const givenSelect = card.querySelector(".given-select");
      const answerSelect = card.querySelector(".answer-select");
      const stripContainer = card.querySelector(".strip-container");
      const scorePill = card.querySelector(".score-pill");

      function update() {
        const given = givenSelect.value;
        const answer = answerSelect.value;
        practicalNeedleSelections[i] = { given, answer };
        stripContainer.innerHTML = karatStripHtml(given, answer);

        if (given && answer) {
          const { score } = scoreNeedle(given, answer);
          scorePill.style.display = "inline-block";
          scorePill.textContent = `${score} pt${score === 1 ? "" : "s"}`;
          scorePill.className = `score-pill score-${score}`;
        } else {
          scorePill.style.display = "none";
        }
      }

      givenSelect.addEventListener("change", update);
      answerSelect.addEventListener("change", update);
      update();
    }
  }

  function openPracticalModal() {
    renderPracticalNeedles();
    practicalModalOverlay.hidden = false;
  }

  function closePracticalModal() {
    practicalModalOverlay.hidden = true;
  }

  practicalCardBtn.addEventListener("click", openPracticalModal);
  practicalModalCancelBtn.addEventListener("click", closePracticalModal);
  // Clicking the dark backdrop cancels too; clicking inside the modal card
  // itself must not (checked via e.target being the overlay itself, not
  // something inside it, since this listener is on the overlay and clicks
  // inside the card bubble up to it).
  practicalModalOverlay.addEventListener("click", (e) => {
    if (e.target === practicalModalOverlay) closePracticalModal();
  });

  practicalModalSaveBtn.addEventListener("click", () => {
    const gapFound = practicalNeedleSelections.some((s) => !s.given || !s.answer);
    if (gapFound) {
      showErrorToast("Please set every needle's Known Value and Candidate's Answer before saving.");
      return;
    }

    const results = practicalNeedleSelections.map(({ given, answer }) => {
      const { score } = scoreNeedle(given, answer);
      return { given, answer, score };
    });
    const total = results.reduce((sum, r) => sum + r.score, 0);

    practicalNeedleResults = results;
    scorePracticalInput.value = String(total);
    updatePracticalCardLabel();
    recomputeTotal();
    closePracticalModal();
  });
  // ----------------------------------------------------------------------

  const form = document.getElementById("interview-form");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const candidateName = document.getElementById("candidateName").value.trim();
    const interviewDate = document.getElementById("interviewDate").value;
    const company = document.getElementById("company").value.trim();
    const role = document.getElementById("role").value.trim();
    const age = document.getElementById("age").value;
    const experience = document.getElementById("experience").value.trim();
    const bikeAvailable = document.getElementById("bikeAvailable").value;
    const dlAvailable = document.getElementById("dlAvailable").value;
    const scoreTheoryRaw = document.getElementById("scoreTheory").value;
    const scorePracticalRaw = document.getElementById("scorePractical").value;
    const totalScoreRaw = document.getElementById("totalScore").value;
    const localLanguageProficiency = document.getElementById("localLanguageProficiency").value;
    const englishProficiency = document.getElementById("englishProficiency").value;
    const round1Decision = document.getElementById("round1Decision").value.trim();
    const interviewer = document.getElementById("interviewer").value.trim();

    // ---- Mandatory-field validation ----------------------------------
    // Set ENFORCE_ALL_FIELDS_REQUIRED to false (or delete this block down
    // to the closing "// --------" marker) to remove this requirement
    // entirely — the form will then submit with any of these fields left
    // blank, same as before this was added. Remarks and Location (optional
    // detail) are never included here, regardless of the toggle.
    if (ENFORCE_ALL_FIELDS_REQUIRED) {
      const missing = [];
      if (!candidateName) missing.push("Candidate Name");
      if (!interviewDate) missing.push("Date");
      if (!company) missing.push("Company / Previous Employer(s)");
      if (!role) missing.push("Role");
      if (!age) missing.push("Age");
      if (!experience) missing.push("Total Relevant Experience");
      if (!bikeAvailable) missing.push("Bike Available");
      if (!dlAvailable) missing.push("DL/LLR Available");
      if (!scoreTheoryRaw) missing.push("Theory Score");
      if (!scorePracticalRaw) missing.push("Practical Score");
      if (!totalScoreRaw) missing.push("Total Score");
      if (!localLanguageProficiency) missing.push(`${localLanguage} Proficiency`);
      if (!englishProficiency) missing.push("English Proficiency");
      if (!round1Decision) missing.push("Round 1 Decision");
      if (!interviewer) missing.push("Round 1 Interviewer");

      if (missing.length > 0) {
        showErrorToast(`Please fill in: ${missing.join(", ")}.`);
        return;
      }
    }
    // --------------------------------------------------------------------

    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving…";

    try {
      await addDoc(collection(db, "interview_entries"), {
        city,
        interviewDate,
        candidateName,
        locationDetail: document.getElementById("locationDetail").value.trim(),
        company,
        role,
        age: age ? Number(age) : null,
        experience,
        bikeAvailable: bikeAvailable || null,
        dlAvailable: dlAvailable || null,
        scoreTheory: scoreTheoryRaw === "" ? null : Number(scoreTheoryRaw),
        scorePractical: scorePracticalRaw === "" ? null : Number(scorePracticalRaw),
        practicalNeedles: practicalNeedleResults, // per-needle given/answer/score detail, same audit-detail pattern as AP Calibration's `needles` field
        totalScore: totalScoreRaw === "" ? null : Number(totalScoreRaw),
        localLanguage,
        localLanguageProficiency: localLanguageProficiency || null,
        englishProficiency: englishProficiency || null,
        round1Decision,
        interviewer,
        remarks: document.getElementById("remarks").value.trim(),
        createdAt: serverTimestamp(),
      });

      showSaved(candidateName, city);
    } catch (err) {
      console.error(err);
      showErrorToast("Couldn't save this interview entry. Check your connection and try again.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Save interview entry";
    }
  });

  function showSaved(name, city) {
    form.style.display = "none";
    const resultView = document.getElementById("result-view");
    resultView.style.display = "block";
    document.getElementById("saved-name").textContent = name;
    document.getElementById("new-entry-again-link").href = `interview-entry.html?city=${encodeURIComponent(city)}`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

main();
