import { requireAuth, isManagerEmail } from "./authGuard.js";
import { getCities } from "./cities.js";

async function main() {
  const user = await requireAuth();

  const listEl = document.getElementById("city-list");
  const cities = await getCities();

  cities.forEach((city) => {
    const row = document.createElement("a");
    row.href = `city.html?city=${encodeURIComponent(city)}`;
    row.className = "city-row";
    row.innerHTML = `
      <span class="name">${city}</span>
      <span class="arrow">&rarr;</span>
    `;
    listEl.appendChild(row);
  });

  const isManager = await isManagerEmail(user.email);
  if (isManager) {
    const settingsLink = document.getElementById("settings-link");
    if (settingsLink) settingsLink.style.display = "inline-flex";
  }
}

main();
