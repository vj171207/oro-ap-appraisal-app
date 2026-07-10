// api/remove-auditor.js
// Vercel serverless function. Removes an auditor from config/auditors AND
// disables their Firebase Auth login account (full offboarding).
//
// The list-removal part could be done from the browser directly (a Manager
// already has legitimate write access to config/auditors). The reason this
// needs a server at all is the account-disabling part — disabling ANOTHER
// person's login requires Firebase Authentication Admin privileges that no
// ordinary signed-in user's own token can grant, no matter who they are.
// That's what AUTH_ADMIN_SERVICE_ACCOUNT_* provides (see lib/firebaseAdminHelpers.js).
//
// Order of operations matters here: the list removal happens FIRST, using
// the caller's own token (fast, low-risk). Disabling the login account
// happens second, using the service account. If the second step fails for
// any reason (e.g. no login account exists for that email, or a transient
// error), this still reports success on the list removal and surfaces the
// disable-step problem as a warning — so a Manager removing someone from
// the dropdown isn't blocked by an unrelated account-disabling hiccup.

import {
  verifyCallerToken,
  isCallerManager,
  getCurrentAuditors,
  writeAuditorsList,
  getServiceAccountAccessToken,
  lookupUserByEmailAdmin,
  disableUserAdmin,
} from "../lib/firebaseAdminHelpers.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { name, empCode, callerIdToken } = req.body || {};

  if (!name || !empCode || !callerIdToken) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey) {
    console.error("FIREBASE_API_KEY environment variable is not set.");
    return res.status(500).json({ error: "Server misconfiguration. Contact your admin." });
  }

  try {
    // 1. Verify caller, same as create-user.js.
    const callerEmail = await verifyCallerToken(callerIdToken, apiKey);
    if (!callerEmail) {
      return res.status(401).json({ error: "Invalid or expired session. Please sign in again and retry." });
    }

    const isManager = await isCallerManager(callerIdToken, callerEmail);
    if (!isManager) {
      return res.status(403).json({ error: "Only Managers can remove auditors." });
    }

    // 2. Find the matching entry — its OWN stored email is what gets used
    //    for the disable step below, never a client-supplied value, so a
    //    mismatch can't cause the wrong account to be touched.
    const currentList = await getCurrentAuditors(callerIdToken);
    const matched = currentList.find((a) => a.name === name && a.empCode === empCode);

    if (!matched) {
      return res.status(400).json({ error: `Couldn't find "${name}" (${empCode}) in the auditor list — nothing removed.` });
    }

    const newList = currentList.filter((a) => !(a.name === name && a.empCode === empCode));
    const wroteList = await writeAuditorsList(callerIdToken, newList);
    if (!wroteList) {
      return res.status(500).json({ error: "Couldn't remove them from the auditor list. Please try again." });
    }

    // 3. Disable their login account, using the service account's elevated
    //    access. If anything here fails, the list removal above already
    //    succeeded — report that clearly rather than implying total failure.
    const email = matched.email;
    if (!email) {
      // Entries created before the email field existed won't have one on
      // record — nothing we can safely disable without it.
      return res.status(200).json({
        success: true,
        warning: `Removed from the auditor list. No email was on record for this entry (it may have been added before this feature existed) — disable their login manually in Firebase Console \u2192 Authentication \u2192 Users if needed.`,
      });
    }

    try {
      const accessToken = await getServiceAccountAccessToken();
      const uid = await lookupUserByEmailAdmin(email, accessToken);

      if (!uid) {
        return res.status(200).json({
          success: true,
          warning: `Removed from the auditor list. No login account was found for ${email} — nothing to disable.`,
        });
      }

      const disabled = await disableUserAdmin(uid, accessToken);
      if (!disabled) {
        return res.status(200).json({
          success: true,
          warning: `Removed from the auditor list, but couldn't disable the login account for ${email}. Disable it manually in Firebase Console \u2192 Authentication \u2192 Users.`,
        });
      }

      return res.status(200).json({ success: true });
    } catch (err) {
      console.error("Error disabling account:", err);
      return res.status(200).json({
        success: true,
        warning: `Removed from the auditor list, but couldn't disable the login account for ${email} (${err.message}). Disable it manually in Firebase Console \u2192 Authentication \u2192 Users.`,
      });
    }
  } catch (err) {
    console.error("remove-auditor error:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
