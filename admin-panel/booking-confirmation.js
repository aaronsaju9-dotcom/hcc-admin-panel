"use strict";

let confirmationData = null;
try {
  confirmationData = JSON.parse(sessionStorage.getItem("hcc-booking-confirmation") || "null");
} catch {
  confirmationData = null;
}
if (!confirmationData && location.hash.length > 1) {
  try {
    confirmationData = JSON.parse(decodeURIComponent(location.hash.slice(1)));
  } catch {
    confirmationData = null;
  }
}

const validReference = confirmationData && /^HCC-\d{8}-[A-Z0-9]{6,12}$/.test(String(confirmationData.reference || "").toUpperCase());
if (!validReference) {
  document.getElementById("confirmation-missing").style.display = "block";
} else {
  document.getElementById("confirmation-reference").textContent = String(confirmationData.reference).toUpperCase();
  document.getElementById("confirmation-type").textContent = String(confirmationData.requestType || "Booking request");
  document.getElementById("confirmation-title").textContent = String(confirmationData.title || "HCC booking");
  const detail = String(confirmationData.detail || "");
  document.getElementById("confirmation-detail").textContent = detail;
  if (!detail) document.getElementById("confirmation-detail-row").hidden = true;
  if (confirmationData.deliveryDelayed) document.getElementById("confirmation-warning").style.display = "block";
  document.getElementById("confirmation-content").hidden = false;
}
