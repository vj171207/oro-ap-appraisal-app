// Shared toast notification system, used site-wide.
//
// Two purposes:
// 1. showToast()/showErrorToast() — an explicit, visible way for any page's
//    code to surface a message (e.g. "this AP belongs to a different city").
// 2. installGlobalErrorReporting() — a safety net that catches any
//    otherwise-uncaught JS error or promise rejection and shows it as a
//    toast automatically. Without this, a bug like a malformed Firestore
//    document crashing a click handler fails completely silently for
//    anyone not looking at the browser console — which in practice has
//    meant every such bug needed a screenshot round-trip to diagnose.
//    This makes the failure visible immediately, on-screen, for anyone.

export function showToast(message, variant = "error") {
  const existing = document.querySelector(".toast-error");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast-error";
  if (variant === "info") toast.classList.add("toast-info");

  toast.innerHTML = `
    <span class="toast-icon">${variant === "info" ? "i" : "!"}</span>
    <span class="toast-message"></span>
    <button type="button" class="toast-close" aria-label="Dismiss">&times;</button>
  `;
  // Set text via textContent, not innerHTML, so error messages (which may
  // contain arbitrary characters from a stack trace) can't inject markup.
  toast.querySelector(".toast-message").textContent = message;

  document.body.appendChild(toast);

  const remove = () => toast.remove();
  toast.querySelector(".toast-close").addEventListener("click", remove);
  setTimeout(remove, 8000);
}

export function showErrorToast(message) {
  showToast(message, "error");
}

/**
 * Call once per page (e.g. from authGuard's requireAuth, so it's automatic
 * everywhere). Catches uncaught exceptions and unhandled promise rejections
 * — the two ways a bug can fail completely silently in the browser — and
 * shows them as a toast instead. Still logs to console as before, for
 * anyone who does have DevTools open.
 */
export function installGlobalErrorReporting() {
  if (window.__errorReportingInstalled) return; // avoid double-installing if called from multiple places
  window.__errorReportingInstalled = true;

  window.addEventListener("error", (event) => {
    console.error("Uncaught error:", event.error || event.message);
    showErrorToast(`Something went wrong: ${describeError(event.error || event.message)}`);
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.error("Unhandled promise rejection:", event.reason);
    showErrorToast(`Something went wrong: ${describeError(event.reason)}`);
  });
}

function describeError(err) {
  if (!err) return "unknown error";
  if (typeof err === "string") return err;
  if (err.code) return err.code; // Firebase errors have a short, useful .code
  if (err.message) return err.message;
  return String(err);
}
