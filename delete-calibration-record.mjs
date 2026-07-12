// scripts/delete-calibration-record.mjs
//
// One-off utility to delete a SPECIFIC calibration record from Firestore.
// This bypasses firestore.rules entirely (which forbid update/delete on
// /calibrations for everyone, including signed-in app users — that's
// deliberate audit-integrity protection) by using the same
// AUTH_ADMIN_SERVICE_ACCOUNT_EMAIL / AUTH_ADMIN_SERVICE_ACCOUNT_KEY
// credentials already configured in Vercel for api/create-user.js and
// api/remove-auditor.js, requested with Firestore's "datastore" OAuth
// scope instead of their usual "identitytoolkit" scope.
//
// IMPORTANT — this may fail with a permission error even with valid
// credentials: those two env vars were originally granted only Firebase
// Auth Admin rights. If the underlying GCP service account was never also
// given a Firestore role, requesting a different OAuth scope for the same
// key doesn't grant new permissions — IAM controls what the account can
// actually do, not the scope string. If this script fails with a 403,
// either:
//   (a) grant that service account the "Cloud Datastore User" IAM role in
//       Google Cloud Console → IAM & Admin → find the service account
//       email → Edit → Add Role, or
//   (b) skip this script and just delete the one record manually in
//       Firebase Console → Firestore Database → calibrations → find the
//       doc → delete. For a single record, that's arguably simpler than
//       fixing IAM for a one-time script.
//
// USAGE (run locally, never commit real credentials):
//   AUTH_ADMIN_SERVICE_ACCOUNT_EMAIL="..." \
//   AUTH_ADMIN_SERVICE_ACCOUNT_KEY="..." \
//   node scripts/delete-calibration-record.mjs
//
// This is a SEARCH-THEN-CONFIRM script, not a blind delete: it first prints
// every matching record in full and requires you to type DELETE before
// touching anything. If you want to target a different record, edit the
// FILTERS block below.

import crypto from "crypto";
import readline from "readline";

const PROJECT_ID = "oro-appraisalcalib";

// ---- Adjust these to match the record you actually want to delete ----
// (Currently set for: Manikandan R / ORO00025, audited by Rijin C /
// ORO00259, test date 01/01/23, score 8/10, auto-fail triggered.)
const FILTERS = {
  apEmpCode: "ORO00025",
  auditorEmpCode: "ORO00259",
  testDate: "2023-01-01",
};
// ------------------------------------------------------------------------

function base64url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken() {
  const email = process.env.AUTH_ADMIN_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.AUTH_ADMIN_SERVICE_ACCOUNT_KEY;
  if (!email || !rawKey) {
    throw new Error(
      "Set AUTH_ADMIN_SERVICE_ACCOUNT_EMAIL and AUTH_ADMIN_SERVICE_ACCOUNT_KEY " +
      "(same values as in Vercel's env vars) before running this script."
    );
  }
  const key = rawKey.replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64url(Buffer.from(JSON.stringify(header)));
  const encodedClaim = base64url(Buffer.from(JSON.stringify(claimSet)));
  const signatureInput = `${encodedHeader}.${encodedClaim}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signatureInput);
  const signature = signer.sign(key);
  const encodedSignature = base64url(signature);

  const jwt = `${signatureInput}.${encodedSignature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error("Failed to get access token: " + JSON.stringify(data));
  }
  return data.access_token;
}

function buildStructuredQuery(filters) {
  const compositeFilters = Object.entries(filters).map(([field, value]) => ({
    fieldFilter: {
      field: { fieldPath: field },
      op: "EQUAL",
      value: { stringValue: value },
    },
  }));

  return {
    structuredQuery: {
      from: [{ collectionId: "calibrations" }],
      where: { compositeFilter: { op: "AND", filters: compositeFilters } },
    },
  };
}

/** Flattens Firestore's REST field-value wrapper format into plain JS values, for readable printing. */
function unwrapFields(fields) {
  const out = {};
  for (const [key, val] of Object.entries(fields || {})) {
    if ("stringValue" in val) out[key] = val.stringValue;
    else if ("integerValue" in val) out[key] = Number(val.integerValue);
    else if ("doubleValue" in val) out[key] = val.doubleValue;
    else if ("booleanValue" in val) out[key] = val.booleanValue;
    else if ("arrayValue" in val) out[key] = (val.arrayValue.values || []).map((v) => unwrapFields({ v }).v);
    else if ("mapValue" in val) out[key] = unwrapFields(val.mapValue.fields);
    else if ("nullValue" in val) out[key] = null;
    else out[key] = val;
  }
  return out;
}

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log("Looking up matching calibration records with filters:", FILTERS, "\n");

  const accessToken = await getAccessToken();

  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(buildStructuredQuery(FILTERS)),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Query failed (${res.status}): ${errText}`);
  }

  const rows = await res.json();
  const matches = rows.filter((r) => r.document).map((r) => ({
    path: r.document.name,
    fields: unwrapFields(r.document.fields),
  }));

  if (matches.length === 0) {
    console.log("No matching records found. Nothing to delete. Check the FILTERS block if you expected a match.");
    return;
  }

  console.log(`Found ${matches.length} matching record(s):\n`);
  matches.forEach((m, i) => {
    console.log(`[${i + 1}] ${m.path}`);
    console.log(JSON.stringify(m.fields, null, 2));
    console.log("");
  });

  const answer = await confirm(
    `Type DELETE to permanently remove ${matches.length === 1 ? "this record" : "ALL of these records"} from Firestore, or anything else to cancel: `
  );

  if (answer !== "DELETE") {
    console.log("Cancelled. Nothing was deleted.");
    return;
  }

  for (const m of matches) {
    const delRes = await fetch(`https://firestore.googleapis.com/v1/${m.path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (delRes.ok) {
      console.log(`Deleted: ${m.path}`);
    } else {
      const errText = await delRes.text();
      console.log(`FAILED to delete ${m.path}: ${delRes.status} ${errText}`);
    }
  }
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
