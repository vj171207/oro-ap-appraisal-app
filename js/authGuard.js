// Shared auth guard — imported at the top of every page that requires
// login. Redirects to login.html if not signed in, or if signed in with a
// non-@orocorp.in account (defense in depth alongside the Firestore rules
// themselves, which are the real enforcement layer).
//
// Also populates a "Signed in as X · Sign out" element if the page has one
// with id="user-bar".

import { auth, onAuthStateChanged, signOut } from "./firebase-config.js";

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

function renderUserBar(user) {
  const bar = document.getElementById("user-bar");
  if (!bar) return;
  bar.innerHTML = `
    <span class="user-bar-name">${escapeHtml(user.displayName || user.email)}</span>
    <button type="button" id="sign-out-btn" class="user-bar-signout">Sign out</button>
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
