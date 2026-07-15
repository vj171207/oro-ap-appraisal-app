// Shared auth guard — imported at the top of every page that requires
// login. Redirects to login.html if not signed in, or if signed in with a
// non-@orocorp.in account (defense in depth alongside the Firestore rules
// themselves, which are the real enforcement layer).
//
// Also populates a "Signed in as X · Sign out" element if the page has one
// with id="user-bar".

import { auth, onAuthStateChanged, signOut, db, doc, getDoc } from "./firebase-config.js";
import { installGlobalErrorReporting } from "./toast.js";

installGlobalErrorReporting();

const ALLOWED_DOMAIN = "orocorp.in";

function isAllowedEmail(email) {
  return typeof email === "string" && email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
}

/** True if THIS page load was a browser refresh (F5 / reload button), as opposed to a normal navigation (clicking a link, or our own post-login redirect) — these are indistinguishable to Firebase's session persistence, but the browser itself tracks the difference. */
function wasPageReloaded() {
  const entries = performance.getEntriesByType("navigation");
  return entries.length > 0 && entries[0].type === "reload";
}

/**
 * Resolves once the user's auth state is confirmed valid. Redirects to
 * login.html (with a `next` param to return to) if not signed in, not an
 * allowed domain, or if this specific page load was an actual browser
 * refresh (session persistence otherwise correctly keeps you signed in
 * across normal in-app navigation, which we deliberately don't want to
 * break — this refresh check is what makes "refresh forces a fresh
 * sign-in" work without also logging people out every time they click a
 * link within the app). Never resolves in the redirect case — the page
 * navigates away instead.
 */
export function requireAuth() {
  return new Promise((resolve) => {
    const forceReauth = wasPageReloaded();

    onAuthStateChanged(auth, async (user) => {
      if (forceReauth && user) {
        await signOut(auth);
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `login.html?next=${next}`;
        return;
      }

      if (user && isAllowedEmail(user.email)) {
        renderUserBar(user);
        wireDatePickerClicks();
        document.body.classList.add("auth-ready");
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

// Bare names, without ".html" — vercel.json has "cleanUrls": true, which
// strips the extension from the actual browser address bar (so
// window.location.pathname for city.html is really "/city", not
// "/city.html"). Comparing against the bare name handles that; it also
// still works correctly if cleanUrls is ever turned off, since the ".html"
// suffix gets stripped from the pathname below either way.
//
// index.html is the cross-app workspace chooser (bare "" and "index" are
// intentionally NOT listed in either array below — the chooser itself
// isn't part of either app, so it correctly falls through to the `return
// null` case, same as before this file was renamed from home.html).
const CALIBRATION_PAGES = ["calibration-home", "city", "calibration", "reports", "settings-calibration"];
const INTERVIEW_PAGES = ["interview", "interview-city", "interview-entry", "interview-reports", "settings-interview"];

function currentSettingsPage() {
  const lastSegment = window.location.pathname.split("/").pop();
  const currentFile = lastSegment.replace(/\.html$/, "");
  if (CALIBRATION_PAGES.includes(currentFile)) return "settings-calibration.html";
  if (INTERVIEW_PAGES.includes(currentFile)) return "settings-interview.html";
  return null; // index.html (the chooser), login.html, or anything else outside either app
}

async function renderUserBar(user) {
  const bar = document.getElementById("user-bar");
  if (!bar) return;

  const managerStatus = await isManagerEmail(user.email);
  const settingsPage = currentSettingsPage();
  const settingsLinkHtml = managerStatus && settingsPage
    ? `<a href="${settingsPage}" class="user-bar-pill">⚙ Settings</a>`
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

/**
 * Native <input type="date"> only opens its picker when you click the tiny
 * calendar icon by default — clicking the rest of the field just places a
 * text cursor. showPicker() (supported in modern Chromium/Edge, and recent
 * Safari) lets a click anywhere in the field open the picker instead.
 * Falls back to default behavior silently on browsers without showPicker.
 */
function wireDatePickerClicks() {
  document.querySelectorAll('input[type="date"]').forEach((input) => {
    if (input.dataset.pickerWired) return; // avoid double-binding if called more than once
    input.dataset.pickerWired = "true";
    input.addEventListener("click", () => {
      if (typeof input.showPicker === "function") {
        try {
          input.showPicker();
        } catch (err) {
          // Some browsers throw if the input isn't visible/focusable yet — safe to ignore.
        }
      }
    });
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
 *
 * Cached in sessionStorage for the duration of the browser tab session —
 * without this, every single page load (on every page, for every user)
 * triggered its own Firestore read just to decide whether to show the
 * Settings link, which added a network round-trip to every page view.
 * Manager status realistically never changes mid-session; the actual
 * security boundary is still enforced server-side by the Firestore rules
 * on every write attempt regardless of what this cached value says — this
 * only affects whether the Settings *link* is shown, not what's allowed.
 */
export async function isManagerEmail(email) {
  if (!email) return false;
  const cacheKey = `managerCheck:${email.toLowerCase()}`;

  const cached = sessionStorage.getItem(cacheKey);
  if (cached !== null) {
    return cached === "true";
  }

  let result = false;
  try {
    const snap = await getDoc(doc(db, "config", "managers"));
    if (snap.exists()) {
      const emails = snap.data().emails || [];
      result = emails.includes(email.toLowerCase());
    }
  } catch (err) {
    console.error("Couldn't check manager status.", err);
    result = false;
  }

  sessionStorage.setItem(cacheKey, String(result));
  return result;
}
