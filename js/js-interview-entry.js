import { requireAuth } from "./authGuard.js";
import { db, collection, addDoc, serverTimestamp } from "./firebase-config.js";

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

  const form = document.getElementById("interview-form");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const candidateName = document.getElementById("candidateName").value.trim();
    if (!candidateName) {
      alert("Please enter the candidate's name.");
      return;
    }

    const interviewDate = document.getElementById("interviewDate").value;
    if (!interviewDate) {
      alert("Please select the interview date.");
      return;
    }

    const scoreTheoryRaw = document.getElementById("scoreTheory").value;
    const scorePracticalRaw = document.getElementById("scorePractical").value;
    const totalScoreRaw = document.getElementById("totalScore").value;

    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving…";

    try {
      await addDoc(collection(db, "interview_entries"), {
        city,
        interviewDate,
        candidateName,
        locationDetail: document.getElementById("locationDetail").value.trim(),
        company: document.getElementById("company").value.trim(),
        role: document.getElementById("role").value.trim(),
        age: document.getElementById("age").value ? Number(document.getElementById("age").value) : null,
        experience: document.getElementById("experience").value.trim(),
        bikeAvailable: document.getElementById("bikeAvailable").value || null,
        dlAvailable: document.getElementById("dlAvailable").value || null,
        scoreTheory: scoreTheoryRaw === "" ? null : Number(scoreTheoryRaw),
        scorePractical: scorePracticalRaw === "" ? null : Number(scorePracticalRaw),
        totalScore: totalScoreRaw === "" ? null : Number(totalScoreRaw),
        localLanguage,
        localLanguageProficiency: document.getElementById("localLanguageProficiency").value || null,
        englishProficiency: document.getElementById("englishProficiency").value || null,
        round1Decision: document.getElementById("round1Decision").value.trim(),
        interviewer: document.getElementById("interviewer").value.trim(),
        remarks: document.getElementById("remarks").value.trim(),
        createdAt: serverTimestamp(),
      });

      showSaved(candidateName, city);
    } catch (err) {
      console.error(err);
      alert("Couldn't save this interview entry. Check your connection and try again.");
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
