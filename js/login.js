import {
  auth, GoogleAuthProvider, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut,
} from "./firebase-config.js";

const ALLOWED_DOMAIN = "orocorp.in";

const signInBtn = document.getElementById("google-signin-btn");
const errorEl = document.getElementById("login-error");

function isAllowedEmail(email) {
  return typeof email === "string" && email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.style.display = "block";
}

function getNextUrl() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  // Only ever redirect to a same-site relative path — never trust an
  // absolute/external URL from a query param.
  if (next && next.startsWith("/") === false && !next.includes("://")) {
    return next;
  }
  return "index.html";
}

// If already signed in with a valid account (e.g. returning to this page
// by mistake, or session already active), just go straight through.
onAuthStateChanged(auth, (user) => {
  if (user && isAllowedEmail(user.email)) {
    window.location.href = getNextUrl();
  }
});

// Handle the result of a redirect-based sign-in (the user is sent back here
// after completing sign-in on accounts.google.com).
getRedirectResult(auth)
  .then((result) => {
    if (!result || !result.user) return; // no redirect result pending, normal page load
    if (isAllowedEmail(result.user.email)) {
      window.location.href = getNextUrl();
    } else {
      signOut(auth);
      showError("This app is restricted to Oro (@orocorp.in) accounts. Please sign in with your work account.");
    }
  })
  .catch((err) => {
    console.error(err);
    showError("Sign-in failed. Please try again.");
  });

signInBtn.addEventListener("click", () => {
  signInBtn.disabled = true;
  signInBtn.textContent = "Redirecting…";
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ hd: ALLOWED_DOMAIN }); // hints Google to prioritize orocorp.in accounts, not a security boundary on its own
  signInWithRedirect(auth, provider);
});
