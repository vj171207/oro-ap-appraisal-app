import { requireAuth, isManagerEmail } from "./authGuard.js";
import { initCitySettings, loadCityList } from "./citySettings.js";
import { db } from "./firebase-config.js";
import { DEFAULT_LANGUAGE_BY_CITY, loadCityLanguageMap, saveCityLanguageMap } from "./cityLanguages.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/**
 * AP Interview-only — deliberately NOT part of citySettings.js. City
 * *management* (add/remove) is the one thing genuinely shared with AP
 * Calibration; the language spoken in a city is not a calibration concept
 * at all, so baking a language field into the shared "Add a city" widget
 * would put an irrelevant field on Calibration's Settings page too. This
 * still lives on the same page, right below Add a city, so setting a new
 * city's language is still a single Settings visit — just not the same
 * shared component.
 */
async function initCityLanguages() {
  const container = document.getElementById("city-language-list");

  async function render() {
    const [cities, languageMap] = await Promise.all([loadCityList(db), loadCityLanguageMap(db)]);

    if (cities.length === 0) {
      container.innerHTML = `<div class="empty-state">No cities configured yet — add one above first.</div>`;
      return;
    }

    container.innerHTML = cities
      .map((city) => {
        // Firestore value wins if set; otherwise fall back to the legacy
        // hardcoded default (so the original 8 cities still show their
        // correct language even before a Manager has touched this section);
        // otherwise blank, which is the expected state for a brand-new city.
        const currentValue = languageMap[city] || DEFAULT_LANGUAGE_BY_CITY[city] || "";
        return `
          <div class="city-row">
            <span class="name">${escapeHtml(city)}</span>
            <div class="city-language-controls">
              <input
                type="text"
                class="city-language-input"
                data-city="${escapeHtml(city)}"
                value="${escapeHtml(currentValue)}"
                placeholder="Not set"
              />
              <button type="button" class="btn btn-secondary city-language-save-btn" data-city="${escapeHtml(city)}">Save</button>
            </div>
          </div>`;
      })
      .join("");

    container.querySelectorAll(".city-language-save-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const city = btn.dataset.city;
        const input = container.querySelector(`.city-language-input[data-city="${cssEscape(city)}"]`);
        const newLanguage = input.value.trim();

        if (!newLanguage) {
          showRowMessage(btn, "Enter a language, or leave the default as-is.", true);
          return;
        }

        btn.disabled = true;
        btn.textContent = "Saving…";
        try {
          const currentMap = await loadCityLanguageMap(db);
          currentMap[city] = newLanguage;
          await saveCityLanguageMap(db, currentMap);
          showRowMessage(btn, "Saved.", false);
        } catch (err) {
          console.error(err);
          showRowMessage(btn, "Couldn't save. Try again.", true);
        } finally {
          btn.disabled = false;
          btn.textContent = "Save";
        }
      });
    });
  }

  // Minimal escape for the CSS attribute-selector lookup above — city
  // names are plain text (letters/spaces/periods), but this guards against
  // a stray quote breaking the selector rather than assuming.
  function cssEscape(str) {
    return str.replace(/"/g, '\\"');
  }

  function showRowMessage(btn, text, isError) {
    const controls = btn.closest(".city-language-controls");
    let msgEl = controls.querySelector(".city-language-msg");
    if (!msgEl) {
      msgEl = document.createElement("span");
      msgEl.className = "city-language-msg";
      controls.appendChild(msgEl);
    }
    msgEl.textContent = text;
    msgEl.style.color = isError ? "var(--fail-bright)" : "var(--pass-bright)";
    setTimeout(() => msgEl.remove(), 3000);
  }

  await render();
  return { refresh: render };
}

async function main() {
  const user = await requireAuth();

  const isManager = await isManagerEmail(user.email);
  if (!isManager) {
    document.getElementById("access-denied").style.display = "block";
    return;
  }
  document.getElementById("settings-content").style.display = "block";

  const cityLanguages = await initCityLanguages();
  initCitySettings(() => cityLanguages.refresh());
}

main();
