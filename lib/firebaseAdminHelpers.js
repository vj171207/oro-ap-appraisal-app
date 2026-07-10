// lib/firebaseAdminHelpers.js
// Shared helpers used by api/create-user.js and api/remove-auditor.js.
// Deliberately in /lib, not /api — Vercel only auto-routes files directly
// inside /api, so this stays a plain importable module, not its own endpoint.

import crypto from "crypto";

export const PROJECT_ID = "oro-appraisalcalib";
export const ALLOWED_DOMAIN = "orocorp.in";

export function isAllowedEmail(email) {
  return typeof email === "string" && email.toLowerCase().trim().endsWith(`@${ALLOWED_DOMAIN}`);
}

/** Verifies a Firebase ID token is genuinely valid and current, returning the REAL verified email (never trust a client-supplied email for authorization decisions). */
export async function verifyCallerToken(idToken, apiKey) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    }
  );
  const data = await res.json();
  const email = data.users?.[0]?.email;
  if (data.error || !email) return null;
  return email;
}

/** Checks config/managers using the CALLER's own token — Firestore rules already allow any signed-in @orocorp.in user to read this document, so no elevated credential is needed just to check. */
export async function isCallerManager(idToken, callerEmail) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/config/managers`,
    { headers: { Authorization: `Bearer ${idToken}` } }
  );
  if (!res.ok) return false;
  const data = await res.json();
  const emails = (data.fields?.emails?.arrayValue?.values || []).map((v) => v.stringValue);
  return emails.includes(callerEmail.toLowerCase());
}

export async function getCurrentAuditors(idToken) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/config/auditors`,
    { headers: { Authorization: `Bearer ${idToken}` } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  const values = data.fields?.list?.arrayValue?.values || [];
  const list = values.map((v) => ({
    name: v.mapValue?.fields?.name?.stringValue || "",
    empCode: v.mapValue?.fields?.empCode?.stringValue || "",
    email: v.mapValue?.fields?.email?.stringValue || "",
  }));
  // A blank/malformed entry (e.g. a stray placeholder left by Firestore
  // Console's "add array field" UI) should never be treated as a real
  // auditor — filtered out here so it can't confuse a duplicate check or
  // silently block a removal elsewhere.
  return list.filter((a) => a.name.trim().length > 0 && a.empCode.trim().length > 0);
}

/** Full overwrite of config/auditors' list field, using the caller's own token (a Manager already has legitimate write access here under the existing Firestore rules). */
export async function writeAuditorsList(idToken, list) {
  const payload = {
    fields: {
      list: {
        arrayValue: {
          values: list.map((a) => ({
            mapValue: {
              fields: {
                name: { stringValue: a.name },
                empCode: { stringValue: a.empCode },
                email: { stringValue: a.email || "" },
              },
            },
          })),
        },
      },
    },
  };

  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/config/auditors?updateMask.fieldPaths=list`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(payload),
    }
  );
  return res.ok;
}

function base64url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Exchanges the AUTH_ADMIN_SERVICE_ACCOUNT_* credentials for a short-lived
 * OAuth2 access token, via the same JWT-bearer flow used elsewhere in this
 * project (the Apps Script AP roster sync uses the equivalent flow, just
 * signed with Apps Script's Utilities.computeRsaSha256Signature instead of
 * Node's crypto module — same underlying mechanism).
 *
 * This is the ONLY place in the app that uses an elevated, non-caller
 * credential — needed specifically because disabling another person's
 * Firebase Auth account requires Firebase Authentication Admin privileges
 * that no ordinary signed-in user's own token can grant, no matter who
 * they are.
 */
export async function getServiceAccountAccessToken() {
  const email = process.env.AUTH_ADMIN_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.AUTH_ADMIN_SERVICE_ACCOUNT_KEY;
  if (!email || !rawKey) {
    throw new Error("AUTH_ADMIN_SERVICE_ACCOUNT_EMAIL / AUTH_ADMIN_SERVICE_ACCOUNT_KEY environment variables are not set.");
  }
  const key = rawKey.replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: email,
    scope: "https://www.googleapis.com/auth/identitytoolkit",
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
    throw new Error("Failed to get service account access token: " + JSON.stringify(data));
  }
  return data.access_token;
}

/** Admin-mode lookup by email — requires the service account's elevated token; an ordinary user's own token can only look up themselves, not an arbitrary other account. */
export async function lookupUserByEmailAdmin(email, accessToken) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ email: [email] }),
    }
  );
  const data = await res.json();
  return data.users?.[0]?.localId || null;
}

export async function disableUserAdmin(uid, accessToken) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ localId: uid, disableUser: true }),
    }
  );
  return res.ok;
}
