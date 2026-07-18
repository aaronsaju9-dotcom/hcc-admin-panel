"use strict";

const params = new URLSearchParams(window.location.hash.slice(1));
const token = params.get("access_token");
const message = document.getElementById("message");
const resetForm = document.getElementById("resetForm");

if (!token) {
  message.hidden = false;
  message.className = "message error";
  message.textContent = "This reset link is missing or expired. Request a new reset email.";
}

resetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.hidden = false;
  message.className = "message";
  message.textContent = "Updating password...";
  const response = await fetch("/api/password-update-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      accessToken: token,
      newPassword: document.getElementById("password").value,
      mfaCode: document.getElementById("mfaCode").value
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    message.className = "message error";
    message.textContent = result.error || "Password update failed.";
    return;
  }
  history.replaceState(null, "", "/login");
  resetForm.hidden = true;
  message.textContent = "Password updated. You can sign in now.";
});
