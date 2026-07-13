// js/auditorList.js
// Fetches and filters config/auditors — the standardized name/empCode/email
// roster Managers maintain via Settings (see settings-calibration.js /
// api/create-user.js). Extracted from calibration.js (AP Calibration's
// Auditor dropdown was first to build this) so AP Interview's Round 1
// Interviewer dropdown reads the exact same roster the exact same way,
// rather than a second copy that could quietly drift.
//
// A blank/malformed entry (e.g. a stray placeholder left by Firestore
// Console's "add array field" UI) should never show up as a selectable
// name — filtered out here. Entries created before the `email` field
// existed simply have email === "" and are still valid for name/empCode
// purposes; only the auto-select-by-email convenience (in
// interview-entry.js) can't match those, which is expected, not a bug.

import { doc, getDoc } from "./firebase-config.js";

/** @returns {Promise<Array<{name: string, empCode: string, email: string}>>} */
export async function loadAuditorList(db) {
  try {
    const snap = await getDoc(doc(db, "config", "auditors"));
    const rawList = snap.exists() && Array.isArray(snap.data().list) ? snap.data().list : [];
    return rawList.filter(
      (a) =>
        a &&
        typeof a === "object" &&
        typeof a.name === "string" &&
        a.name.trim().length > 0 &&
        typeof a.empCode === "string" &&
        a.empCode.trim().length > 0
    );
  } catch (err) {
    console.error("Couldn't load auditor list.", err);
    return [];
  }
}
