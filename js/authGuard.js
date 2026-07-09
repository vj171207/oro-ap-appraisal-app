// Shared auth guard — imported at the top of every page that requires
// login. Redirects to login.html if not signed in, or if signed in with a
// non-@orocorp.in account (defense in depth alongside the Firestore rules
// themselves, which are the real enforcement layer).
//
// Also populates a "Signed in as X · Sign out" element if the page has one
// with id="user-bar".

import { auth, onAuthStateChanged, signOut, db, doc, getDoc } from "./firebase-config.js";

const ALLOWED_DOMAIN = "orocorp.in";

function isAllowedEmail(email) {
  return typeof email === "string" && email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
}

/**
 * Resolves once the user's auth state is confirmed valid. Redirects to
 * login.html (with a `next` param to return to) if not signed in or not an
 * allowed domain. Never resolves in the redirect case — the page navigates
 * away instead.
 */
export function requireAuth() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (user && isAllowedEmail(user.email)) {
        renderUserBar(user);
        resolve(user);
      } else {
        if (user) {
          // Signed in, but with a disallowed email — sign out before
          // bouncing, so a stale non-Oro session doesn't linger.
          signOut(auth);
        }
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `login.html?next=${next}`;
      }
    });
  });
}

async function renderUserBar(user) {
  const bar = document.getElementById("user-bar");
  if (!bar) return;

  const managerStatus = await isManagerEmail(user.email);
  const settingsLinkHtml = managerStatus
    ? `<a href="settings.html" class="user-bar-pill">⚙ Settings</a>`
    : "";

  bar.innerHTML = `
    <div class="user-bar-row">
      <span class="user-bar-name">${escapeHtml(user.displayName || user.email)}</span>
      <button type="button" id="sign-out-btn" class="user-bar-pill">Sign out</button>
    </div>
    ${settingsLinkHtml}
  `;
  document.getElementById("sign-out-btn").addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "login.html";
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Checks whether an email is in the Firestore-managed list of Managers
 * (config/managers, field "emails"). That document is only editable
 * directly in the Firebase Console (allow write: if false in the rules) —
 * intentionally not self-service, since it's rarely changed and the
 * consequence of getting it wrong (someone gaining Settings access) is
 * more sensitive than the city list itself.
 *
 * Emails in that document must be stored lowercase — this check lowercases
 * the input to match, but does not lowercase the stored list itself.
 */
export async function isManagerEmail(email) {
  if (!email) return false;
  try {
    const snap = await getDoc(doc(db, "config", "managers"));
    if (!snap.exists()) return false;
    const emails = snap.data().emails || [];
    return emails.includes(email.toLowerCase());
  } catch (err) {
    console.error("Couldn't check manager status.", err);
    return false;
  }
}
