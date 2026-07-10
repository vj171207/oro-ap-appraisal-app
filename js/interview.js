import { requireAuth } from "./authGuard.js";

async function main() {
  await requireAuth();
}

main();
