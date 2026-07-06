import { CITIES } from "./cities.js";

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
