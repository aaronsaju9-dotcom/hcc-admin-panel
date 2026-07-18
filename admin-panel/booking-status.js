"use strict";

document.getElementById("status-form").addEventListener("submit", async function handleStatusSubmit(event) {
  event.preventDefault();
  const button = this.querySelector("button");
  const result = document.getElementById("status-result");
  const data = Object.fromEntries(new FormData(this).entries());
  data.reference = String(data.reference || "").trim().toUpperCase();
  data.email = String(data.email || "").trim().toLowerCase();
  result.className = "message";
  if (!/^HCC-\d{8}-[A-Z0-9]{6,12}$/.test(data.reference) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) {
    result.textContent = "Enter a valid HCC booking reference and email address.";
    result.className = "message visible error";
    return;
  }
  button.disabled = true;
  button.textContent = "Checking...";
  try {
    const apiResponse = await fetch("/api/booking-status", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    const booking = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok) throw new Error(booking.error || "No matching booking was found.");
    const labels = {
      new: "Received — HCC has your request.",
      contacted: "Contacted — the HCC team is following up.",
      confirmed: "Confirmed — your booking has been approved.",
      declined: "Not available — please contact HCC for alternatives.",
      completed: "Completed.",
      cancelled: "Cancelled."
    };
    const detail = booking.booking_date_label || booking.booking_date || booking.tournament_name || booking.booking_type || "";
    result.textContent = `${labels[booking.status] || booking.status}${detail ? ` ${detail}.` : ""} `;
    const reference = document.createElement("span");
    reference.className = "reference";
    reference.textContent = booking.reference;
    result.appendChild(reference);
    result.className = "message visible success";
  } catch (error) {
    result.textContent = error.message || "We could not check that booking.";
    result.className = "message visible error";
  } finally {
    button.disabled = false;
    button.textContent = "Check status";
  }
});
