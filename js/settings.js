import { requireAuth, isManagerEmail } from "./authGuard.js";
import { db, doc, getDoc, updateDoc, arrayUnion, arrayRemove } from "./firebase-config.js";

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
  const newAuditorEmailInput = document.getElementById("new-auditor-email-input");
  const newAuditorPasswordInput = document.getElementById("new-auditor-password-input");
  const addAuditorBtn = document.getElementById("add-auditor-btn");
  const auditorErrorEl = document.getElementById("add-auditor-error");
  const auditorSuccessEl = document.getElementById("add-auditor-success");

  const auditorsDocRef = doc(db, "config", "auditors");
  let auditorsExpanded = false;

  async function loadAuditors() {
    const snap = await getDoc(auditorsDocRef);
    const rawList = snap.exists() && Array.isArray(snap.data().list) ? snap.data().list : [];
    // Defensive filter: a malformed entry (e.g. a stray placeholder left by
    // Firestore Console's "add array field" UI, which isn't a proper
    // {name, empCode} object) should be silently dropped here, not crash
    // the whole page the way a bare .toLowerCase() on undefined would.
    const list = rawList.filter(
      (a) =>
        a &&
        typeof a === "object" &&
        typeof a.name === "string" &&
        a.name.trim().length > 0 &&
        typeof a.empCode === "string" &&
        a.empCode.trim().length > 0
    );
    if (list.length !== rawList.length) {
      console.warn(`config/auditors contains ${rawList.length - list.length} malformed entr(y/ies) — ignored. Check Firestore Console.`);
    }
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
          <button type="button" class="remove-entry-btn" data-name="${escapeHtml(a.name)}" data-empcode="${escapeHtml(a.empCode)}">Remove</button>
        </div>`
      )
      .join("");

    auditorListEl.querySelectorAll(".remove-entry-btn").forEach((btn) => {
      btn.addEventListener("click", () => removeAuditor(btn.dataset.name, btn.dataset.empcode));
    });
  }

  async function removeAuditor(name, empCode) {
    const confirmed = confirm(
      `Remove "${name}" (${empCode})?\n\nThis removes them from the calibration form's dropdown AND disables their login entirely — they will no longer be able to sign in. This can't be undone from here.`
    );
    if (!confirmed) return;

    clearAuditorMessages();
    try {
      const callerIdToken = await user.getIdToken();
      const response = await fetch("/api/remove-auditor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, empCode, callerIdToken }),
      });
      const result = await response.json();

      if (!response.ok) {
        auditorErrorEl.textContent = result.error || "Couldn't remove them. Please try again.";
        auditorErrorEl.style.display = "block";
        return;
      }

      if (result.warning) {
        // Partial success — the list removal worked, but something about
        // disabling the login didn't go as cleanly. Show it as a warning,
        // not a success, so it doesn't look like everything went perfectly.
        auditorErrorEl.textContent = result.warning;
        auditorErrorEl.style.display = "block";
      } else {
        auditorSuccessEl.textContent = `"${name}" removed and their login disabled.`;
        auditorSuccessEl.style.display = "block";
      }
      await loadAuditors();
    } catch (err) {
      console.error(err);
      auditorErrorEl.textContent = "Couldn't remove them. Please try again.";
      auditorErrorEl.style.display = "block";
    }
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
    const newEmail = newAuditorEmailInput.value.trim();
    const newPassword = newAuditorPasswordInput.value;

    if (!newName || !newCode || !newEmail || !newPassword) {
      auditorErrorEl.textContent = "Enter a name, employee code, email, and password.";
      auditorErrorEl.style.display = "block";
      return;
    }
    if (newPassword.length < 6) {
      auditorErrorEl.textContent = "Password must be at least 6 characters.";
      auditorErrorEl.style.display = "block";
      return;
    }

    addAuditorBtn.disabled = true;
    addAuditorBtn.textContent = "Adding…";

    try {
      // The server does its own duplicate/authorization checks against the
      // live data — the account-creation step can't safely happen from the
      // browser at all (see api/create-user.js for why), so this endpoint
      // handles both the login account and the auditors-list entry together.
      const callerIdToken = await user.getIdToken();
      const response = await fetch("/api/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          name: newName,
          empCode: newCode,
          callerIdToken,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        auditorErrorEl.textContent = result.error || "Couldn't add the auditor. Please try again.";
        auditorErrorEl.style.display = "block";
        return;
      }

      auditorSuccessEl.textContent = `"${newName}" added, with a login account for ${newEmail}. They'll now appear in the auditor dropdown on the calibration form.`;
      auditorSuccessEl.style.display = "block";
      newAuditorNameInput.value = "";
      newAuditorCodeInput.value = "";
      newAuditorEmailInput.value = "";
      newAuditorPasswordInput.value = "";
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
    const rawList = snap.exists() && Array.isArray(snap.data().list) ? snap.data().list : [];
    const list = rawList.filter((c) => typeof c === "string" && c.trim().length > 0);
    if (list.length !== rawList.length) {
      console.warn(`config/cities contains ${rawList.length - list.length} malformed entr(y/ies) — ignored. Check Firestore Console.`);
    }
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
      .map(
        (c) => `
        <div class="city-row" style="cursor: default;">
          <span class="name">${escapeHtml(c)}</span>
          <button type="button" class="remove-entry-btn" data-city="${escapeHtml(c)}">Remove</button>
        </div>`
      )
      .join("");

    cityListEl.querySelectorAll(".remove-entry-btn").forEach((btn) => {
      btn.addEventListener("click", () => removeCity(btn.dataset.city));
    });
  }

  async function removeCity(cityName) {
    const confirmed = confirm(
      `Remove "${cityName}" from the city list?\n\nThis only removes it from the picker — any calibration records already saved under this name are NOT deleted, and will reappear if you add this exact spelling back later.`
    );
    if (!confirmed) return;

    try {
      await updateDoc(citiesDocRef, { list: arrayRemove(cityName) });
      await loadCities();
    } catch (err) {
      console.error(err);
      errorEl.textContent = `Couldn't remove "${cityName}". Please try again.`;
      errorEl.style.display = "block";
    }
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
