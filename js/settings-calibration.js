import { requireAuth, isManagerEmail } from "./authGuard.js";
import { db } from "./firebase-config.js";
import { initCitySettings } from "./citySettings.js";
import { loadAuditorList } from "./auditorList.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function main() {
  const user = await requireAuth();

  const isManager = await isManagerEmail(user.email);
  if (!isManager) {
    document.getElementById("access-denied").style.display = "block";
    return;
  }
  document.getElementById("settings-content").style.display = "block";

  // ---- Auditors ----

  const auditorListEl = document.getElementById("auditor-list-display");
  const toggleAuditorsBtn = document.getElementById("toggle-auditors-btn");
  const newAuditorNameInput = document.getElementById("new-auditor-name-input");
  const newAuditorCodeInput = document.getElementById("new-auditor-code-input");
  const newAuditorEmailInput = document.getElementById("new-auditor-email-input");
  const newAuditorPasswordInput = document.getElementById("new-auditor-password-input");
  const addAuditorBtn = document.getElementById("add-auditor-btn");
  const auditorErrorEl = document.getElementById("add-auditor-error");
  const auditorSuccessEl = document.getElementById("add-auditor-success");

  let auditorsExpanded = false;

  async function loadAuditors() {
    const list = await loadAuditorList(db);
    renderAuditors(list);
    updateToggleLabel(toggleAuditorsBtn, "auditors", list.length, auditorsExpanded);
    return list;
  }

  function renderAuditors(list) {
    if (list.length === 0) {
      auditorListEl.innerHTML = `<div class="empty-state">No auditors configured yet.</div>`;
      return;
    }
    auditorListEl.innerHTML = list
      .map(
        (a) => `
        <div class="city-row" style="cursor: default;">
          <span class="name">${escapeHtml(a.name)}</span>
          <span style="font-family: var(--font-mono); font-size: 12px; color: var(--text-muted);">${escapeHtml(a.empCode)}</span>
          <button type="button" class="remove-entry-btn" data-name="${escapeHtml(a.name)}" data-empcode="${escapeHtml(a.empCode)}">Remove</button>
        </div>`
      )
      .join("");

    auditorListEl.querySelectorAll(".remove-entry-btn").forEach((btn) => {
      btn.addEventListener("click", () => removeAuditor(btn.dataset.name, btn.dataset.empcode));
    });
  }

  async function removeAuditor(name, empCode) {
    const confirmed = confirm(
      `Remove "${name}" (${empCode})?\n\nThis removes them from the calibration form's dropdown AND disables their login entirely — they will no longer be able to sign in. This can't be undone from here.`
    );
    if (!confirmed) return;

    clearAuditorMessages();
    try {
      const callerIdToken = await user.getIdToken();
      const response = await fetch("/api/remove-auditor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, empCode, callerIdToken }),
      });
      const result = await response.json();

      if (!response.ok) {
        auditorErrorEl.textContent = result.error || "Couldn't remove them. Please try again.";
        auditorErrorEl.style.display = "block";
        return;
      }

      if (result.warning) {
        // Partial success — the list removal worked, but something about
        // disabling the login didn't go as cleanly. Show it as a warning,
        // not a success, so it doesn't look like everything went perfectly.
        auditorErrorEl.textContent = result.warning;
        auditorErrorEl.style.display = "block";
      } else {
        auditorSuccessEl.textContent = `"${name}" removed and their login disabled.`;
        auditorSuccessEl.style.display = "block";
      }
      await loadAuditors();
    } catch (err) {
      console.error(err);
      auditorErrorEl.textContent = "Couldn't remove them. Please try again.";
      auditorErrorEl.style.display = "block";
    }
  }

  function clearAuditorMessages() {
    auditorErrorEl.style.display = "none";
    auditorSuccessEl.style.display = "none";
  }

  toggleAuditorsBtn.addEventListener("click", () => {
    auditorsExpanded = !auditorsExpanded;
    auditorListEl.style.display = auditorsExpanded ? "block" : "none";
    loadAuditors();
  });

  addAuditorBtn.addEventListener("click", async () => {
    clearAuditorMessages();
    const newName = newAuditorNameInput.value.trim();
    const newCode = newAuditorCodeInput.value.trim();
    const newEmail = newAuditorEmailInput.value.trim();
    const newPassword = newAuditorPasswordInput.value;

    if (!newName || !newCode || !newEmail || !newPassword) {
      auditorErrorEl.textContent = "Enter a name, employee code, email, and password.";
      auditorErrorEl.style.display = "block";
      return;
    }
    if (newPassword.length < 6) {
      auditorErrorEl.textContent = "Password must be at least 6 characters.";
      auditorErrorEl.style.display = "block";
      return;
    }

    addAuditorBtn.disabled = true;
    addAuditorBtn.textContent = "Adding…";

    try {
      // The server does its own duplicate/authorization checks against the
      // live data — the account-creation step can't safely happen from the
      // browser at all (see api/create-user.js for why), so this endpoint
      // handles both the login account and the auditors-list entry together.
      const callerIdToken = await user.getIdToken();
      const response = await fetch("/api/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          name: newName,
          empCode: newCode,
          callerIdToken,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        auditorErrorEl.textContent = result.error || "Couldn't add the auditor. Please try again.";
        auditorErrorEl.style.display = "block";
        return;
      }

      auditorSuccessEl.textContent = `"${newName}" added, with a login account for ${newEmail}. They'll now appear in the auditor dropdown on the calibration form.`;
      auditorSuccessEl.style.display = "block";
      newAuditorNameInput.value = "";
      newAuditorCodeInput.value = "";
      newAuditorEmailInput.value = "";
      newAuditorPasswordInput.value = "";
      await loadAuditors();
    } catch (err) {
      console.error(err);
      auditorErrorEl.textContent = "Couldn't add the auditor. Please try again.";
      auditorErrorEl.style.display = "block";
    } finally {
      addAuditorBtn.disabled = false;
      addAuditorBtn.textContent = "Add Auditor";
    }
  });

  function updateToggleLabel(btn, noun, count, expanded) {
    const arrow = expanded ? "▾" : "▸";
    const verb = expanded ? "Hide" : "Show";
    btn.textContent = `${arrow} ${verb} current ${noun} (${count})`;
  }

  loadAuditors();
  initCitySettings();
}

main();
