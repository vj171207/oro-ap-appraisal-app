import { requireAuth } from "./authGuard.js";
import { CITIES } from "./cities.js";

async function main() {
  await requireAuth();

  const listEl = document.getElementById("city-list");

  CITIES.forEach((city) => {
    const row = document.createElement("a");
    row.href = `city.html?city=${encodeURIComponent(city)}`;
    row.className = "city-row";
    row.innerHTML = `
      <span class="name">${city}</span>
      <span class="arrow">&rarr;</span>
    `;
    listEl.appendChild(row);
  });

}

main();
