// api/create-user.js
// Vercel serverless function. Creates a Firebase Auth login account and adds
// the same person to config/auditors, in one request.
//
// Why this needs a server at all: the Firebase client SDK's
// createUserWithEmailAndPassword() has a side effect of signing the browser
// into the newly created account — which would kick the Manager doing the
// adding out of their own session. There's no client-side way to create
// someone else's account without hijacking your own. This function creates
// the account server-side instead, so nothing in the Manager's browser
// session is touched.
//
// Deliberately uses NO service account / elevated credential. Every
// operation here is authorized using the calling Manager's own ID token,
// which they already legitimately have from being signed in — the same
// permissions this function exercises (reading config/managers, reading and
// writing config/auditors) are permissions that Manager already has when
// acting directly from the browser. This function just does the one thing
// a browser can't do safely (account creation) as part of the same flow.
//
// config/managers is untouched by this endpoint entirely — it stays
// Console-only, exactly as before. This function can only ever create
// Auditor-role accounts.

const PROJECT_ID = "oro-appraisalcalib";
const ALLOWED_DOMAIN = "orocorp.in";

function isAllowedEmail(email) {
  return typeof email === "string" && email.toLowerCase().trim().endsWith(`@${ALLOWED_DOMAIN}`);
}

async function verifyCallerToken(idToken, apiKey) {
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

async function isCallerManager(idToken, callerEmail) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/config/managers`,
    { headers: { Authorization: `Bearer ${idToken}` } }
  );
  if (!res.ok) return false;
  const data = await res.json();
  const emails = (data.fields?.emails?.arrayValue?.values || []).map((v) => v.stringValue);
  return emails.includes(callerEmail.toLowerCase());
}

async function getCurrentAuditors(idToken) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/config/auditors`,
    { headers: { Authorization: `Bearer ${idToken}` } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  const values = data.fields?.list?.arrayValue?.values || [];
  return values.map((v) => ({
    name: v.mapValue?.fields?.name?.stringValue || "",
    empCode: v.mapValue?.fields?.empCode?.stringValue || "",
  }));
}

async function writeAuditorsList(idToken, list) {
  const payload = {
    fields: {
      list: {
        arrayValue: {
          values: list.map((a) => ({
            mapValue: {
              fields: {
                name: { stringValue: a.name },
                empCode: { stringValue: a.empCode },
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { email, password, name, empCode, callerIdToken } = req.body || {};

  if (!email || !password || !name || !empCode || !callerIdToken) {
    return res.status(400).json({ error: "All fields are required." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }
  if (!isAllowedEmail(email)) {
    return res.status(400).json({ error: `Email must be an @${ALLOWED_DOMAIN} address — this app only accepts Oro accounts.` });
  }

  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey) {
    console.error("FIREBASE_API_KEY environment variable is not set.");
    return res.status(500).json({ error: "Server misconfiguration. Contact your admin." });
  }

  try {
    // 1. Verify the caller's session is genuinely valid, and get their REAL
    //    verified email — never trust a client-supplied email for this check.
    const callerEmail = await verifyCallerToken(callerIdToken, apiKey);
    if (!callerEmail) {
      return res.status(401).json({ error: "Invalid or expired session. Please sign in again and retry." });
    }

    // 2. Confirm the caller is an actual current Manager.
    const isManager = await isCallerManager(callerIdToken, callerEmail);
    if (!isManager) {
      return res.status(403).json({ error: "Only Managers can add new auditors." });
    }

    // 3. Duplicate checks against the current list, before creating anything.
    const currentList = await getCurrentAuditors(callerIdToken);
    const nameDup = currentList.some((a) => a.name.toLowerCase() === name.toLowerCase());
    const codeDup = currentList.some((a) => a.empCode.toLowerCase() === empCode.toLowerCase());
    if (nameDup) {
      return res.status(400).json({ error: `"${name}" is already in the auditor list.` });
    }
    if (codeDup) {
      return res.status(400).json({ error: `Employee code "${empCode}" is already assigned to someone else.` });
    }

    // 4. Create the Firebase Auth account.
    const signupRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: false }),
      }
    );
    const signupData = await signupRes.json();
    if (signupData.error) {
      const msg = signupData.error.message;
      if (msg === "EMAIL_EXISTS") {
        return res.status(400).json({ error: "This email already has a login account." });
      }
      if (msg && msg.startsWith("WEAK_PASSWORD")) {
        return res.status(400).json({ error: "Password is too weak. Use at least 6 characters." });
      }
      return res.status(400).json({ error: msg || "Couldn't create the account." });
    }

    // 5. Add to config/auditors. If this fails, the login account still
    //    exists — say so clearly rather than leaving it ambiguous.
    const newList = [...currentList, { name, empCode }];
    const wroteAuditorEntry = await writeAuditorsList(callerIdToken, newList);
    if (!wroteAuditorEntry) {
      return res.status(500).json({
        error: `Login account for ${email} was created, but adding "${name}" to the auditor list failed. Add them manually below using the same name and code.`,
        accountCreated: true,
      });
    }

    return res.status(200).json({ success: true, email, name, empCode });
  } catch (err) {
    console.error("create-user error:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
