// City list — now stored in Firestore (config/cities, field "list") instead
// of hardcoded, so Managers can add a new city from the Settings page
// without a code change or redeploy.
//
// FALLBACK_CITIES exists only as a safety net in case the config/cities
// document hasn't been created yet (e.g. right after this feature first
// deploys, before the one-time Firestore setup is done) — see README for
// the one-time setup steps.

import { db, doc, getDoc } from "./firebase-config.js";

const FALLBACK_CITIES = [
  "Chennai", "Bengaluru", "Hyderabad", "Pune",
  "Vijayawada", "Guntur", "Warangal", "Karimnagar",
];

export async function getCities() {
  try {
    const snap = await getDoc(doc(db, "config", "cities"));
    if (snap.exists() && Array.isArray(snap.data().list)) {
      const filtered = snap.data().list.filter((c) => typeof c === "string" && c.trim().length > 0);
      if (filtered.length > 0) return filtered;
    }
  } catch (err) {
    console.error("Couldn't load city list from Firestore, using fallback.", err);
  }
  return FALLBACK_CITIES;
}
