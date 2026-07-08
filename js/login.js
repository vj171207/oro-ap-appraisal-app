import {
  auth, signInWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut,
} from "./firebase-config.js";

const ALLOWED_DOMAIN = "orocorp.in";

const form = document.getElementById("login-form");
const emailInput = document.getElementById("login-email");
const passwordInput = document.getElementById("login-password");
const submitBtn = document.getElementById("login-submit-btn");
const errorEl = document.getElementById("login-error");
const noticeEl = document.getElementById("login-notice");
const forgotLink = document.getElementById("forgot-link");

function isAllowedEmail(email) {
  return typeof email === "string" && email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
}

function showError(message) {
  noticeEl.style.display = "none";
  errorEl.textContent = message;
  errorEl.style.display = "block";
}

function showNotice(message) {
  errorEl.style.display = "none";
  noticeEl.textContent = message;
  noticeEl.style.display = "block";
}

function clearMessages() {
  errorEl.style.display = "none";
  noticeEl.style.display = "none";
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

// If already signed in with a valid account, skip the form entirely.
onAuthStateChanged(auth, (user) => {
  if (user && isAllowedEmail(user.email)) {
    window.location.href = getNextUrl();
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

forgotLink.addEventListener("click", async () => {
  clearMessages();
  const email = emailInput.value.trim();
  if (!email) {
    showError("Enter your email above first, then click \"Forgot password?\"");
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    showNotice(`Password reset link sent to ${email}. Check your inbox.`);
  } catch (err) {
    console.error(err);
    if (err.code === "auth/user-not-found") {
      // Deliberately vague — don't reveal whether an account exists for a given email.
      showNotice(`If an account exists for ${email}, a reset link has been sent.`);
    } else {
      showError(`Couldn't send reset email (${err.code || "unknown error"}).`);
    }
  }
});
