// js/cityLanguages.js
// Maps a city -> its local language, for the "Local Language Proficiency"
// field on the AP Interview entry form. Backed by config/cityLanguages in
// Firestore (a single map field: { "Chennai": "Tamil", ... }), managed by
// Managers via Settings → AP Interview → "Local languages", the same
// pattern as config/cities and config/auditors.
//
// Before this existed, this table was hardcoded directly in
// interview-entry.js — which meant adding a city via Settings → "Add a
// city" (citySettings.js, shared with AP Calibration) had NO connection to
// language at all: a newly-added city would silently fall back to a
// generic "Local Language Proficiency" label until someone edited the
// source code and redeployed. That hardcoded table is kept here as
// DEFAULT_LANGUAGE_BY_CITY — a fallback for the original 8 cities so
// nothing regresses on the day this ships, before a Manager has had a
// chance to visit the new Settings section — but Firestore always wins
// once a city has an entry there.

import { doc, getDoc, setDoc } from "./firebase-config.js";

export const DEFAULT_LANGUAGE_BY_CITY = {
  "Bengaluru": "Kannada",
  "Chennai": "Tamil",
  "Hyderabad": "Telugu",
  "Pune": "Marathi/Hindi",
  "Vijayawada": "Telugu",
  "Guntur": "Telugu",
  "Warangal": "Telugu",
  "Karimnagar": "Telugu",
};

/** @returns {Promise<Object<string,string>>} the Firestore-managed city->language map, or {} if the doc doesn't exist yet or a malformed entry needs to be dropped. */
export async function loadCityLanguageMap(db) {
  try {
    const snap = await getDoc(doc(db, "config", "cityLanguages"));
    const rawMap = snap.exists() && typeof snap.data().map === "object" && snap.data().map !== null ? snap.data().map : {};
    const cleanMap = {};
    for (const [city, language] of Object.entries(rawMap)) {
      if (typeof city === "string" && city.trim() && typeof language === "string" && language.trim()) {
        cleanMap[city] = language;
      }
    }
    return cleanMap;
  } catch (err) {
    console.error("Couldn't load config/cityLanguages.", err);
    return {};
  }
}

/** Firestore's map always wins if the city has an entry there; falls back to the legacy hardcoded table, then null (caller decides the generic label). */
export function resolveLanguageForCity(city, firestoreMap) {
  if (firestoreMap && typeof firestoreMap[city] === "string" && firestoreMap[city].trim()) {
    return firestoreMap[city];
  }
  return DEFAULT_LANGUAGE_BY_CITY[city] || null;
}

/** Full-map overwrite (mirrors writeAuditorsList's approach) — avoids Firestore dotted-field-path quirks with city names that contain spaces. Creates config/cityLanguages if it doesn't exist yet. */
export async function saveCityLanguageMap(db, map) {
  await setDoc(doc(db, "config", "cityLanguages"), { map }, { merge: true });
}
