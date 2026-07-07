import { db, collection, addDoc, Timestamp } from "../js/firebase-config.js";

const importBtn = document.getElementById("import-btn");
const progressWrap = document.getElementById("progress-wrap");
const progressFill = document.getElementById("progress-fill");
const logEl = document.getElementById("log");

function log(line) {
  logEl.style.display = "block";
  logEl.textContent += line + "\n";
  logEl.scrollTop = logEl.scrollHeight;
}

importBtn.addEventListener("click", async () => {
  const confirmed = confirm(
    "This will write 789 historical records to your live Firestore database. " +
    "This cannot be undone from the app (records can't be edited/deleted via the app once created). " +
    "Have you confirmed this hasn't been run before? Continue?"
  );
  if (!confirmed) return;

  importBtn.disabled = true;
  importBtn.textContent = "Importing…";
  progressWrap.style.display = "block";

  let records;
  try {
    const res = await fetch("./historical-data.json");
    records = await res.json();
  } catch (err) {
    log(`FAILED to load historical-data.json: ${err.message}`);
    importBtn.textContent = "Failed to load data";
    return;
  }

  log(`Loaded ${records.length} records. Starting import...\n`);

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    // Drop the two source-tracking fields before writing — they were only
    // for our own debugging during the transform step, not part of the
    // app's schema. Also add createdAt: without it, city.js's
    // orderBy("createdAt") query silently excludes the document entirely
    // (Firestore drops docs missing the sort field from ordered results).
    // Derived from the historical test date, not "now" — so old records
    // sort correctly relative to each other and to future live entries,
    // rather than all clustering at the moment of import.
    const { sourceTab, sourceRow, ...rest } = record;
    const createdAt = record.testDate
      ? Timestamp.fromDate(new Date(record.testDate))
      : Timestamp.now();
    const docData = { ...rest, createdAt };

    try {
      await addDoc(collection(db, "calibrations"), docData);
      succeeded++;
    } catch (err) {
      failed++;
      log(`FAILED [${sourceTab} row ${sourceRow}] ${record.apName} (${record.apEmpCode}): ${err.message}`);
    }

    if (i % 25 === 0 || i === records.length - 1) {
      const pct = Math.round(((i + 1) / records.length) * 100);
      progressFill.style.width = `${pct}%`;
    }
  }

  log(`\nDone. ${succeeded} succeeded, ${failed} failed out of ${records.length}.`);
  importBtn.textContent = `Import complete: ${succeeded} succeeded, ${failed} failed`;

  if (failed === 0) {
    log("\nAll records imported successfully. You can now delete this admin/ folder from the repo.");
  } else {
    log("\nSome records failed — check the errors above before deleting this admin/ folder.");
  }
});
