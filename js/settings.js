import { requireAuth, isManagerEmail } from "./authGuard.js";
import { db, doc, getDoc, updateDoc, arrayUnion } from "./firebase-config.js";

async function main() {
  const user = await requireAuth();

  const isManager = await isManagerEmail(user.email);
  if (!isManager) {
    document.getElementById("access-denied").style.display = "block";
    return;
  }
  document.getElementById("settings-content").style.display = "block";

  const cityListEl = document.getElementById("city-list-display");
  const newCityInput = document.getElementById("new-city-input");
  const addCityBtn = document.getElementById("add-city-btn");
  const errorEl = document.getElementById("add-city-error");
  const successEl = document.getElementById("add-city-success");

  const citiesDocRef = doc(db, "config", "cities");

  async function loadCities() {
    const snap = await getDoc(citiesDocRef);
    const list = snap.exists() && Array.isArray(snap.data().list) ? snap.data().list : [];
    renderCities(list);
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

  addCityBtn.addEventListener("click", async () => {
    clearMessages();
    const newCity = newCityInput.value.trim();

    if (!newCity) {
      errorEl.textContent = "Enter a city name first.";
      errorEl.style.display = "block";
      return;
    }

    const currentList = await loadCities();
    const isDuplicate = currentList.some((c) => c.toLowerCase() === newCity.toLowerCase());
    if (isDuplicate) {
      errorEl.textContent = `"${newCity}" already exists in the list (check for a near-match, e.g. casing).`;
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

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  loadCities();
}

main();
