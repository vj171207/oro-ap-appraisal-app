import {
  auth, signInWithEmailAndPassword, onAuthStateChanged, signOut,
} from "./firebase-config.js";
import { installGlobalErrorReporting } from "./toast.js";

installGlobalErrorReporting();

const ALLOWED_DOMAIN = "orocorp.in";

const form = document.getElementById("login-form");
const emailInput = document.getElementById("login-email");
const passwordInput = document.getElementById("login-password");
const submitBtn = document.getElementById("login-submit-btn");
const errorEl = document.getElementById("login-error");

function isAllowedEmail(email) {
  return typeof email === "string" && email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.style.display = "block";
}

function clearMessages() {
  errorEl.style.display = "none";
}

function getNextUrl() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  // Only ever redirect to a same-site relative path — never trust an
  // absolute/external URL from a query param.
  //
  // `next` is always built by authGuard.js from window.location.pathname,
  // which always starts with a single "/" — so a legitimate same-site
  // value looks like "/interview-entry.html?city=Chennai". The check below
  // requires exactly that shape: starts with "/" (a site-relative path),
  // but not "//" (protocol-relative, e.g. "//evil.com" — a classic
  // open-redirect trick browsers treat as "same protocol, different
  // host"), and contains no "://" (rules out "https://evil.com" too).
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.includes("://")) {
    return next;
  }
  return "home.html";
}

// If already signed in with a valid account, skip the form entirely —
// UNLESS this page load was an actual browser refresh, in which case we
// force a sign-out so the form is genuinely shown, not bypassed silently.
function wasPageReloaded() {
  const entries = performance.getEntriesByType("navigation");
  return entries.length > 0 && entries[0].type === "reload";
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    document.body.classList.add("auth-ready"); // genuinely showing the sign-in form
    return;
  }
  if (wasPageReloaded()) {
    await signOut(auth);
    document.body.classList.add("auth-ready"); // signed out, form should show
    return;
  }
  if (isAllowedEmail(user.email)) {
    window.location.href = getNextUrl(); // navigating away — stay hidden, no reveal
  } else {
    // Signed in, but with a disallowed email, and not a reload — previously
    // fell through silently here (harmless before, since the page was
    // visible by default). Now that the page is hidden until revealed,
    // this branch needs its own explicit reveal too, or it would leave the
    // page permanently blank instead of showing the sign-in form.
    document.body.classList.add("auth-ready");
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearMessages();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  submitBtn.disabled = true;
  submitBtn.textContent = "Signing in…";

  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    if (isAllowedEmail(result.user.email)) {
      window.location.href = getNextUrl();
    } else {
      await signOut(auth);
      showError("This account isn't authorized for this app. Contact your admin.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Sign In";
    }
  } catch (err) {
    console.error(err);
    if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
      showError("Incorrect email or password.");
    } else if (err.code === "auth/too-many-requests") {
      showError("Too many attempts. Please wait a moment and try again.");
    } else if (err.code === "auth/invalid-email") {
      showError("Please enter a valid email address.");
    } else {
      showError(`Sign-in failed (${err.code || "unknown error"}). Please try again.`);
    }
    submitBtn.disabled = false;
    submitBtn.textContent = "Sign In";
  }
});
