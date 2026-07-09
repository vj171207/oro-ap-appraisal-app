import { requireAuth, isManagerEmail } from "./authGuard.js";
import { db, doc, getDoc, updateDoc, arrayUnion } from "./firebase-config.js";

/** Normalizes to Title Case regardless of input casing — "indore" / "INDORE" / "InDoRe" all become "Indore". Multi-word names are handled per-word ("new delhi" -> "New Delhi"). */
function toTitleCase(str) {
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function main() {
  const user = await requireAuth();

  const isManager = await isManagerEmail(user.email);
  if (!isManager) {
    document.getElementById("access-denied").style.display = "block";
    return;
  }
  document.getElementById("settings-content").style.display = "block";

  // ---- Auditors ----

  const auditorListEl = document.getElementById("auditor-list-display");
  const toggleAuditorsBtn = document.getElementById("toggle-auditors-btn");
  const newAuditorNameInput = document.getElementById("new-auditor-name-input");
  const newAuditorCodeInput = document.getElementById("new-auditor-code-input");
  const addAuditorBtn = document.getElementById("add-auditor-btn");
  const auditorErrorEl = document.getElementById("add-auditor-error");
  const auditorSuccessEl = document.getElementById("add-auditor-success");

  const auditorsDocRef = doc(db, "config", "auditors");
  let auditorsExpanded = false;

  async function loadAuditors() {
    const snap = await getDoc(auditorsDocRef);
    const list = snap.exists() && Array.isArray(snap.data().list) ? snap.data().list : [];
    renderAuditors(list);
    updateToggleLabel(toggleAuditorsBtn, "auditors", list.length, auditorsExpanded);
    return list;
  }

  function renderAuditors(list) {
    if (list.length === 0) {
      auditorListEl.innerHTML = `<div class="empty-state">No auditors configured yet.</div>`;
      return;
    }
    auditorListEl.innerHTML = list
      .map(
        (a) => `
        <div class="city-row" style="cursor: default;">
          <span class="name">${escapeHtml(a.name)}</span>
          <span style="font-family: var(--font-mono); font-size: 12px; color: var(--text-muted);">${escapeHtml(a.empCode)}</span>
        </div>`
      )
      .join("");
  }

  function clearAuditorMessages() {
    auditorErrorEl.style.display = "none";
    auditorSuccessEl.style.display = "none";
  }

  toggleAuditorsBtn.addEventListener("click", () => {
    auditorsExpanded = !auditorsExpanded;
    auditorListEl.style.display = auditorsExpanded ? "block" : "none";
    loadAuditors();
  });

  addAuditorBtn.addEventListener("click", async () => {
    clearAuditorMessages();
    const newName = newAuditorNameInput.value.trim();
    const newCode = newAuditorCodeInput.value.trim();

    if (!newName || !newCode) {
      auditorErrorEl.textContent = "Enter both a name and an employee code.";
      auditorErrorEl.style.display = "block";
      return;
    }

    const currentList = await loadAuditors();
    const nameDuplicate = currentList.some((a) => a.name.toLowerCase() === newName.toLowerCase());
    const codeDuplicate = currentList.some((a) => a.empCode.toLowerCase() === newCode.toLowerCase());
    if (nameDuplicate) {
      auditorErrorEl.textContent = `"${newName}" is already in the list.`;
      auditorErrorEl.style.display = "block";
      return;
    }
    if (codeDuplicate) {
      auditorErrorEl.textContent = `Employee code "${newCode}" is already assigned to someone else.`;
      auditorErrorEl.style.display = "block";
      return;
    }

    addAuditorBtn.disabled = true;
    addAuditorBtn.textContent = "Adding…";

    try {
      await updateDoc(auditorsDocRef, { list: arrayUnion({ name: newName, empCode: newCode }) });
      auditorSuccessEl.textContent = `"${newName}" added. They'll now appear in the auditor dropdown on the calibration form.`;
      auditorSuccessEl.style.display = "block";
      newAuditorNameInput.value = "";
      newAuditorCodeInput.value = "";
      await loadAuditors();
    } catch (err) {
      console.error(err);
      auditorErrorEl.textContent = "Couldn't add the auditor. Please try again.";
      auditorErrorEl.style.display = "block";
    } finally {
      addAuditorBtn.disabled = false;
      addAuditorBtn.textContent = "Add Auditor";
    }
  });

  // ---- Cities ----

  const cityListEl = document.getElementById("city-list-display");
  const toggleCitiesBtn = document.getElementById("toggle-cities-btn");
  const newCityInput = document.getElementById("new-city-input");
  const addCityBtn = document.getElementById("add-city-btn");
  const errorEl = document.getElementById("add-city-error");
  const successEl = document.getElementById("add-city-success");

  const citiesDocRef = doc(db, "config", "cities");
  let citiesExpanded = false;

  async function loadCities() {
    const snap = await getDoc(citiesDocRef);
    const list = snap.exists() && Array.isArray(snap.data().list) ? snap.data().list : [];
    renderCities(list);
    updateToggleLabel(toggleCitiesBtn, "cities", list.length, citiesExpanded);
    return list;
  }

  function renderCities(list) {
    if (list.length === 0) {
      cityListEl.innerHTML = `<div class="empty-state">No cities configured yet.</div>`;
      return;
    }
    cityListEl.innerHTML = list
      .map((c) => `<div class="city-row" style="cursor: default;"><span class="name">${escapeHtml(c)}</span></div>`)
      .join("");
  }

  function clearMessages() {
    errorEl.style.display = "none";
    successEl.style.display = "none";
  }

  toggleCitiesBtn.addEventListener("click", () => {
    citiesExpanded = !citiesExpanded;
    cityListEl.style.display = citiesExpanded ? "block" : "none";
    loadCities();
  });

  addCityBtn.addEventListener("click", async () => {
    clearMessages();
    const rawInput = newCityInput.value.trim();

    if (!rawInput) {
      errorEl.textContent = "Enter a city name first.";
      errorEl.style.display = "block";
      return;
    }

    // Spelling still must match the AP roster exactly, but casing is
    // normalized automatically — "indore" and "INDORE" both save as "Indore".
    const newCity = toTitleCase(rawInput);

    const currentList = await loadCities();
    const isDuplicate = currentList.some((c) => c.toLowerCase() === newCity.toLowerCase());
    if (isDuplicate) {
      errorEl.textContent = `"${newCity}" already exists in the list.`;
      errorEl.style.display = "block";
      return;
    }

    addCityBtn.disabled = true;
    addCityBtn.textContent = "Adding…";

    try {
      await updateDoc(citiesDocRef, { list: arrayUnion(newCity) });
      successEl.textContent = `"${newCity}" added. It will now appear in the city list and can be used for AP roster locations.`;
      successEl.style.display = "block";
      newCityInput.value = "";
      await loadCities();
    } catch (err) {
      console.error(err);
      errorEl.textContent = "Couldn't add the city. Please try again.";
      errorEl.style.display = "block";
    } finally {
      addCityBtn.disabled = false;
      addCityBtn.textContent = "Add City";
    }
  });

  // ---- Shared toggle-label helper ----

  function updateToggleLabel(btn, noun, count, expanded) {
    const arrow = expanded ? "▾" : "▸";
    const verb = expanded ? "Hide" : "Show";
    btn.textContent = `${arrow} ${verb} current ${noun} (${count})`;
  }

  loadAuditors();
  loadCities();
}

main();
