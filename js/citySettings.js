// Shared "Add a city" section logic — used identically by both
// settings-calibration.js and settings-interview.js. City management is the
// one thing both apps have in common (config/cities is read by both AP
// Calibration's index.js/city.js/calibration.js and AP Interview's
// interview.js/interview-entry.js), so this lives in one place rather than
// being copy-pasted into each settings page and risking the two drifting
// apart over time.
//
// Expects the calling page's HTML to have these exact element IDs (same
// markup block as before the split): new-city-input, add-city-btn,
// add-city-error, add-city-success, toggle-cities-btn, city-list-display.

import { db, doc, getDoc, updateDoc, arrayUnion, arrayRemove } from "./firebase-config.js";
import { FALLBACK_CITIES } from "./cities.js";

/** @returns {Promise<string[]>} the filtered config/cities list — falls back to the same FALLBACK_CITIES list as getCities() (cities.js) on any read failure or empty/missing doc, so both places behave identically rather than one returning a safe fallback and the other returning nothing. Exported so other AP Interview-only features (e.g. Local Languages in settings-interview.js) can read the same shared city list without a second copy of this fetch+filter logic. */
export async function loadCityList(db) {
  try {
    const snap = await getDoc(doc(db, "config", "cities"));
    const rawList = snap.exists() && Array.isArray(snap.data().list) ? snap.data().list : [];
    const list = rawList.filter((c) => typeof c === "string" && c.trim().length > 0);
    if (list.length !== rawList.length) {
      console.warn(`config/cities contains ${rawList.length - list.length} malformed entr(y/ies) — ignored. Check Firestore Console.`);
    }
    return list.length > 0 ? list : FALLBACK_CITIES;
  } catch (err) {
    console.error("Couldn't load city list from Firestore, using fallback.", err);
    return FALLBACK_CITIES;
  }
}

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

function updateToggleLabel(btn, noun, count, expanded) {
  const arrow = expanded ? "▾" : "▸";
  const verb = expanded ? "Hide" : "Show";
  btn.textContent = `${arrow} ${verb} current ${noun} (${count})`;
}

/**
 * Call once per settings page, after the manager-access check has passed.
 * @param {() => void} [onCityAdded] - Optional, fired right after a city is
 *   successfully added. Used by settings-interview.js to refresh its
 *   separate Local Languages section so the new city shows up there
 *   immediately, without a page reload. settings-calibration.js doesn't
 *   pass this (has nothing that needs to react to it) and is unaffected.
 */
export function initCitySettings(onCityAdded = () => {}) {
  const cityListEl = document.getElementById("city-list-display");
  const toggleCitiesBtn = document.getElementById("toggle-cities-btn");
  const newCityInput = document.getElementById("new-city-input");
  const addCityBtn = document.getElementById("add-city-btn");
  const errorEl = document.getElementById("add-city-error");
  const successEl = document.getElementById("add-city-success");

  const citiesDocRef = doc(db, "config", "cities");
  let citiesExpanded = false;

  async function loadCities() {
    const list = await loadCityList(db);
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
      `Remove "${cityName}" from the city list?\n\nThis removes it from BOTH the AP Calibration and AP Interview city pickers — it's a shared list. Any records already saved under this name in either app are NOT deleted, and will reappear if you add this exact spelling back later.`
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

    // A city's spelling still must match exactly everywhere it's used (the
    // entry forms, filters, and reports all compare city names as plain
    // strings) — but casing is normalized automatically here, so at least
    // that one common mismatch is handled for you: "indore" and "INDORE"
    // both save as "Indore".
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
      successEl.textContent = `"${newCity}" added. It's shared across both apps — it will now appear in both AP Calibration's and AP Interview's city lists.`;
      successEl.style.display = "block";
      newCityInput.value = "";
      await loadCities();
      onCityAdded();
    } catch (err) {
      console.error(err);
      errorEl.textContent = "Couldn't add the city. Please try again.";
      errorEl.style.display = "block";
    } finally {
      addCityBtn.disabled = false;
      addCityBtn.textContent = "Add City";
    }
  });

  loadCities();
}
