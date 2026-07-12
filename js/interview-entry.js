import { requireAuth } from "./authGuard.js";
import { showErrorToast } from "./toast.js";
import { db, collection, addDoc, serverTimestamp } from "./firebase-config.js";

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
