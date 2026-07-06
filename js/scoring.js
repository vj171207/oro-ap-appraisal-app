// Scoring logic for the AP Appraisal Calibration process.
// Pure functions only — no Firestore, no DOM. Keeps the SOP rules in one
// place and easy to unit-test independently of the rest of the app.

export const KARAT_OPTIONS = ["22K", "21K", "20K", "19K", "18K", "Below 18K"];

const KARAT_VALUE = {
  "22K": 22,
  "21K": 21,
  "20K": 20,
  "19K": 19,
  "18K": 18,
};

const BELOW_18 = "Below 18K";

/**
 * Scores a single needle.
 * @param {string} given  - The known/correct karat value (set by the auditor).
 * @param {string} answer - The karat value the AP reported.
 * @returns {{ score: number, autoFail: boolean }}
 *
 * Rules (per Oro AP Calibration SOP):
 *  - Exact match                              -> 2 points
 *  - Known is "Below 18K", AP answers normal   -> 0 points, AUTO-FAIL
 *    (AP failed to detect a genuinely sub-18K item — the SOP's hard stop)
 *  - AP answers "Below 18K", known is normal   -> 0 points, no auto-fail
 *    (a false alarm — wrong, but not a missed-detection safety issue)
 *  - Both normal karats, 1 karat apart         -> 1 point
 *  - Both normal karats, 2+ karats apart       -> 0 points
 */
export function scoreNeedle(given, answer) {
  if (!given || !answer) {
    throw new Error("Both 'given' and 'answer' karat values are required.");
  }

  if (given === answer) {
    return { score: 2, autoFail: false };
  }

  if (given === BELOW_18 && answer !== BELOW_18) {
    return { score: 0, autoFail: true };
  }

  if (answer === BELOW_18 && given !== BELOW_18) {
    return { score: 0, autoFail: false };
  }

  const diff = Math.abs(KARAT_VALUE[given] - KARAT_VALUE[answer]);
  if (diff === 1) {
    return { score: 1, autoFail: false };
  }
  return { score: 0, autoFail: false };
}

/**
 * Computes the overall result for a set of 5 scored needles.
 * @param {Array<{score: number, autoFail: boolean}>} needleResults
 * @returns {{ totalScore: number, autoFailTriggered: boolean, result: "Pass"|"Fail" }}
 */
export function computeResult(needleResults) {
  const totalScore = needleResults.reduce((sum, n) => sum + n.score, 0);
  const autoFailTriggered = needleResults.some((n) => n.autoFail);
  const result = autoFailTriggered || totalScore <= 6 ? "Fail" : "Pass";
  return { totalScore, autoFailTriggered, result };
}
