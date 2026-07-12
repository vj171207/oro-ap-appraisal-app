import { requireAuth, isManagerEmail } from "./authGuard.js";
import { initCitySettings } from "./citySettings.js";

async function main() {
  const user = await requireAuth();

  const isManager = await isManagerEmail(user.email);
  if (!isManager) {
    document.getElementById("access-denied").style.display = "block";
    return;
  }
  document.getElementById("settings-content").style.display = "block";

  initCitySettings();
}

main();
