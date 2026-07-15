const ACTIVITY_KEY = "hcc-admin-activity-v1";
const API_CONTENT_URL = "/api/content";
const API_UPLOAD_URL = "/api/upload";
const API_SESSION_URL = "/api/session";
const API_CLOUDINARY_DELETE_URL = "/api/cloudinary/delete";
const API_PASSWORD_UPDATE_URL = "/api/password-update";
const API_PASSWORD_RESET_URL = "/api/password-reset";
const API_AUDIT_URL = "/api/audit";
const API_BOOKINGS_URL = "/api/bookings";

const defaultData = {
  tournaments: [
    {
      id: "tourn-ramadan-cup",
      name: "Ramadan Cup 2026",
      status: "upcoming",
      date: "2026-03-01",
      prize: "AED 5,000",
      registration: "open",
      description: "A competitive community cricket tournament hosted at Hamriyah Cricket Centre.",
      rules: ["8 overs per side", "Leather ball only", "Team registration required"],
      registerLink: "",
      cricLink: "",
      poster: ""
    },
    {
      id: "tourn-friday-league",
      name: "Friday Night League",
      status: "ongoing",
      date: "2026-06-26",
      prize: "Trophy and medals",
      registration: "closed",
      description: "Weekly floodlight fixtures for local teams and academy squads.",
      rules: ["League format", "Umpire decision final", "Match balls provided"],
      registerLink: "",
      cricLink: "",
      poster: ""
    }
  ],
  images: [
    {
      id: "img-hero",
      title: "HCC Cricket Ground",
      placement: "hero",
      alt: "Hamriyah Cricket Centre ground",
      src: "hero-bg-cricket.webp"
    },
    {
      id: "img-logo",
      title: "HCC Logo",
      placement: "sponsor",
      alt: "Hamriyah Cricket Centre logo",
      src: "logo.webp"
    }
  ],
  socials: [
    {
      id: "soc-whatsapp",
      platform: "WhatsApp",
      label: "WhatsApp booking",
      url: "https://wa.me/",
      visible: true
    },
    {
      id: "soc-instagram",
      platform: "Instagram",
      label: "HCC Instagram",
      url: "https://instagram.com/",
      visible: true
    }
  ],
  testimonials: [
    {
      id: "test-a",
      name: "Adeel Khan",
      role: "Captain, Sharjah XI",
      text: "The pitch quality and night-match setup make HCC one of our favorite grounds to play at.",
      rating: 5,
      avatar: ""
    },
    {
      id: "test-b",
      name: "Rohan Menon",
      role: "Academy parent",
      text: "The facilities are clean, organized, and easy to book. The coaching environment is excellent.",
      rating: 5,
      avatar: ""
    }
  ]
};

let data = structuredClone(defaultData);
let activity = loadActivity();
let auditEntries = [];
let bookings = [];
let bookingPage = 1;
const expandedBookingReferences = new Set();
let sessionInfo = null;
let cachedUploads = {
  tournamentPoster: null,
  imageFile: null,
  testimonialAvatar: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function clearElement(element) {
  if (element) element.replaceChildren();
}

function appendTextElement(parent, tagName, text, className = "") {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

function appendPill(parent, text, className = "") {
  return appendTextElement(parent, "span", text, `pill${className ? ` ${className}` : ""}`);
}

function appendEmptyState(container, text) {
  clearElement(container);
  appendTextElement(container, "div", text, "empty");
}

document.addEventListener("DOMContentLoaded", async () => {
  bindNavigation();
  bindForms();
  bindToolbar();
  bindFileInputs();
  await loadSession();
  await loadData();
  await loadBookings();
  await loadAuditEntries();
  renderAll();
  routeFromHash();
});

async function loadSession() {
  try {
    const response = await fetch(API_SESSION_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("Session unavailable");
    sessionInfo = await response.json();
  } catch {
    sessionInfo = null;
  }
  renderSessionStatus();
}

async function loadData() {
  try {
    const response = await fetch(API_CONTENT_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("Content API unavailable");
    data = mergeDefaults(await response.json());
  } catch {
    data = structuredClone(defaultData);
    toast("Start the admin server to save shared website content.");
  }
}

async function loadAuditEntries() {
  try {
    const response = await fetch(API_AUDIT_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("Audit API unavailable");
    const result = await response.json();
    auditEntries = Array.isArray(result.entries) ? result.entries : [];
  } catch {
    auditEntries = [];
  }
}

async function loadBookings({ notify = false } = {}) {
  try {
    const response = await fetch(API_BOOKINGS_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("Bookings API unavailable");
    const result = await response.json();
    bookings = Array.isArray(result.bookings) ? result.bookings : [];
    if (notify) toast("Bookings refreshed.");
  } catch {
    bookings = [];
    if (notify) toast("Bookings could not be loaded.");
  }
}

function mergeDefaults(saved) {
  return {
    tournaments: normalizeItems(saved.tournaments),
    images: normalizeItems(saved.images),
    socials: normalizeItems(saved.socials),
    testimonials: normalizeItems(saved.testimonials)
  };
}

function normalizeItems(items) {
  return Array.isArray(items)
    ? items.map((item, index) => ({
      ...item,
      published: item.published !== false,
      featured: item.featured === true,
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : index + 1
    }))
    : [];
}

function sortByOrder(items) {
  return [...items].sort((a, b) => (Number(a.order) || 9999) - (Number(b.order) || 9999));
}

function loadActivity() {
  try {
    const saved = JSON.parse(localStorage.getItem(ACTIVITY_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

async function saveData(message) {
  const response = await fetch(API_CONTENT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    toast("Save failed. Check that the admin server is running.");
    return false;
  }

  data = mergeDefaults(await response.json());
  if (message) addActivity(message);
  await loadAuditEntries();
  renderAll();
  return true;
}

function addActivity(message) {
  activity.unshift({
    message,
    time: new Date().toLocaleString()
  });
  activity = activity.slice(0, 8);
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activity));
}

function bindNavigation() {
  $$("[data-section-link]").forEach((control) => {
    control.addEventListener("click", () => {
      const section = control.dataset.sectionLink;
      showSection(section);
      history.replaceState(null, "", `#${section}`);
      document.body.classList.remove("nav-open");
    });
  });

  $(".menu-toggle").addEventListener("click", () => {
    document.body.classList.toggle("nav-open");
  });

  window.addEventListener("hashchange", routeFromHash);
}

function routeFromHash() {
  const section = window.location.hash.replace("#", "") || "dashboard";
  showSection(section);
}

function showSection(sectionId) {
  const target = document.getElementById(sectionId) ? sectionId : "dashboard";
  $$(".panel-section").forEach((section) => {
    section.classList.toggle("active", section.id === target);
  });
  $$("[data-section-link]").forEach((link) => {
    link.classList.toggle("active", link.dataset.sectionLink === target);
  });
  $("#pageTitle").textContent = document.getElementById(target).dataset.title;
}

function bindToolbar() {
  $("#exportBtn").addEventListener("click", exportJson);
  $("#settingsExportBtn")?.addEventListener("click", exportJson);
  $("#importFile").addEventListener("change", importJson);
  $("#clearActivityBtn").addEventListener("click", async () => {
    await loadAuditEntries();
    renderActivity();
    toast("Audit log refreshed.");
  });

  $("#tournamentSearch").addEventListener("input", renderTournaments);
  ["#bookingSearch", "#bookingStatusFilter", "#bookingPeriodFilter", "#bookingSort", "#bookingPageSize"].forEach((selector) => {
    const eventName = selector === "#bookingSearch" ? "input" : "change";
    $(selector)?.addEventListener(eventName, () => {
      bookingPage = 1;
      renderBookings();
    });
  });
  $("#exportBookingsBtn")?.addEventListener("click", exportBookingsCsv);
  $("#resetBookingFiltersBtn")?.addEventListener("click", () => {
    $("#bookingSearch").value = "";
    $("#bookingStatusFilter").value = "all";
    $("#bookingPeriodFilter").value = "all";
    $("#bookingSort").value = "newest";
    bookingPage = 1;
    renderBookings();
  });
  $("#refreshBookingsBtn")?.addEventListener("click", async () => {
    await loadBookings({ notify: true });
    bookingPage = 1;
    renderBookings();
    renderStats();
    renderQuickPreview();
  });
  $("#newTournamentBtn").addEventListener("click", resetTournamentForm);
  $("#newImageBtn").addEventListener("click", resetImageForm);
  $("#newSocialBtn").addEventListener("click", resetSocialForm);
  $("#newTestimonialBtn").addEventListener("click", resetTestimonialForm);

  $$("[data-reset-form]").forEach((button) => {
    button.addEventListener("click", () => {
      const type = button.dataset.resetForm;
      if (type === "tournament") resetTournamentForm();
      if (type === "image") resetImageForm();
      if (type === "social") resetSocialForm();
      if (type === "testimonial") resetTestimonialForm();
    });
  });
}

function bindForms() {
  $("#tournamentForm").addEventListener("submit", saveTournament);
  $("#imageForm").addEventListener("submit", saveImage);
  $("#socialForm").addEventListener("submit", saveSocial);
  $("#testimonialForm").addEventListener("submit", saveTestimonial);
  $("#passwordForm")?.addEventListener("submit", updatePassword);
  $("#resetEmailForm")?.addEventListener("submit", sendResetEmail);

  $("#deleteTournamentBtn").addEventListener("click", deleteTournament);
  $("#deleteImageBtn").addEventListener("click", deleteImage);
  $("#deleteSocialBtn").addEventListener("click", deleteSocial);
  $("#deleteTestimonialBtn").addEventListener("click", deleteTestimonial);

  $("#testimonialRating").addEventListener("input", () => {
    $("#ratingReadout").textContent = `${$("#testimonialRating").value} stars`;
  });
}

function bindFileInputs() {
  bindImageInput("#tournamentPoster", "tournamentPoster", "#tournamentPosterPreview", "tournaments");
  bindImageInput("#imageFile", "imageFile", "#imagePreview", "gallery");
  bindImageInput("#testimonialAvatar", "testimonialAvatar", "#testimonialAvatarPreview", "testimonials");
}

function bindImageInput(inputSelector, cacheKey, previewSelector, context) {
  $(inputSelector).addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Please choose an image file.");
      event.target.value = "";
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      renderImagePreview(previewSelector, dataUrl);
      setPreviewStatus(previewSelector, "Uploading image...");
      const upload = await uploadImage(dataUrl, file.name, context);
      cachedUploads[cacheKey] = upload;
      renderImagePreview(previewSelector, upload.url);
      toast(upload.provider === "cloudinary" ? "Image uploaded to Cloudinary." : "Image ready locally. Configure Cloudinary for production storage.");
    } catch (error) {
      cachedUploads[cacheKey] = null;
      event.target.value = "";
      $(previewSelector).textContent = "Upload failed";
      toast(error.message || "Image upload failed.");
    }
  });
}

async function deleteCloudinaryImage(publicId) {
  if (!publicId) return;
  try {
    const response = await fetch(API_CLOUDINARY_DELETE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicId })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || "Cloudinary cleanup failed.");
    }
  } catch (error) {
    toast(error.message || "Cloudinary cleanup failed.");
  }
}

function getUploadedUrl(cacheKey, existingUrl = "") {
  return cachedUploads[cacheKey]?.url || existingUrl || "";
}

function getUploadedPublicId(cacheKey, existingPublicId = "") {
  return cachedUploads[cacheKey]?.publicId || existingPublicId || "";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadImage(fileData, filename, context) {
  const response = await fetch(API_UPLOAD_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file: fileData, filename, context })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Image upload failed.");
  return result;
}

function setPreviewStatus(selector, text) {
  const preview = $(selector);
  const status = document.createElement("span");
  status.className = "preview-status";
  status.textContent = text;
  preview.appendChild(status);
}

async function saveTournament(event) {
  event.preventDefault();
  const validation = validateTournamentForm();
  if (!validation.ok) {
    toast(validation.message);
    return;
  }
  const id = $("#tournamentId").value || createId("tournament");
  const existing = data.tournaments.find((item) => item.id === id);
  const item = {
    id,
    name: $("#tournamentName").value.trim(),
    status: $("#tournamentStatus").value,
    date: $("#tournamentDate").value,
    prize: $("#tournamentPrize").value.trim(),
    registration: $("#tournamentRegistration").value,
    description: $("#tournamentDescription").value.trim(),
    rules: $("#tournamentRules").value.split("\n").map((rule) => rule.trim()).filter(Boolean),
    registerLink: $("#tournamentRegisterLink").value.trim(),
    cricLink: $("#tournamentCricLink").value.trim(),
    order: Number($("#tournamentOrder").value) || data.tournaments.length + 1,
    published: $("#tournamentPublished").checked,
    featured: $("#tournamentFeatured").checked,
    poster: getUploadedUrl("tournamentPoster", existing?.poster),
    posterPublicId: getUploadedPublicId("tournamentPoster", existing?.posterPublicId)
  };
  upsert(data.tournaments, item);
  if (await saveData(`${existing ? "Updated" : "Added"} tournament: ${item.name}`)) {
    if (cachedUploads.tournamentPoster?.publicId && existing?.posterPublicId && existing.posterPublicId !== cachedUploads.tournamentPoster.publicId) {
      await deleteCloudinaryImage(existing.posterPublicId);
    }
    resetTournamentForm();
    toast("Tournament saved to website content.");
  }
}

async function saveImage(event) {
  event.preventDefault();
  const validation = validateImageForm();
  if (!validation.ok) {
    toast(validation.message);
    return;
  }
  const id = $("#imageId").value || createId("image");
  const existing = data.images.find((item) => item.id === id);
  const item = {
    id,
    title: $("#imageTitle").value.trim(),
    placement: $("#imagePlacement").value,
    alt: $("#imageAlt").value.trim(),
    order: Number($("#imageOrder").value) || data.images.length + 1,
    published: $("#imagePublished").checked,
    featured: $("#imageFeatured").checked,
    src: getUploadedUrl("imageFile", existing?.src),
    publicId: getUploadedPublicId("imageFile", existing?.publicId)
  };
  upsert(data.images, item);
  if (await saveData(`${existing ? "Updated" : "Added"} image: ${item.title}`)) {
    if (cachedUploads.imageFile?.publicId && existing?.publicId && existing.publicId !== cachedUploads.imageFile.publicId) {
      await deleteCloudinaryImage(existing.publicId);
    }
    resetImageForm();
    toast("Image saved to website content.");
  }
}

async function saveSocial(event) {
  event.preventDefault();
  const validation = validateSocialForm();
  if (!validation.ok) {
    toast(validation.message);
    return;
  }
  const id = $("#socialId").value || createId("social");
  const existing = data.socials.find((item) => item.id === id);
  const item = {
    id,
    platform: $("#socialPlatform").value,
    label: $("#socialLabel").value.trim(),
    url: $("#socialUrl").value.trim(),
    order: Number($("#socialOrder").value) || data.socials.length + 1,
    published: $("#socialVisible").checked,
    visible: $("#socialVisible").checked
  };
  upsert(data.socials, item);
  if (await saveData(`${existing ? "Updated" : "Added"} social: ${item.label}`)) {
    resetSocialForm();
    toast("Social link saved to website content.");
  }
}

async function saveTestimonial(event) {
  event.preventDefault();
  const validation = validateTestimonialForm();
  if (!validation.ok) {
    toast(validation.message);
    return;
  }
  const id = $("#testimonialId").value || createId("testimonial");
  const existing = data.testimonials.find((item) => item.id === id);
  const item = {
    id,
    name: $("#testimonialName").value.trim(),
    role: $("#testimonialRole").value.trim(),
    text: $("#testimonialText").value.trim(),
    rating: Number($("#testimonialRating").value),
    order: Number($("#testimonialOrder").value) || data.testimonials.length + 1,
    published: $("#testimonialPublished").checked,
    featured: $("#testimonialFeatured").checked,
    avatar: getUploadedUrl("testimonialAvatar", existing?.avatar),
    avatarPublicId: getUploadedPublicId("testimonialAvatar", existing?.avatarPublicId)
  };
  upsert(data.testimonials, item);
  if (await saveData(`${existing ? "Updated" : "Added"} testimonial: ${item.name}`)) {
    if (cachedUploads.testimonialAvatar?.publicId && existing?.avatarPublicId && existing.avatarPublicId !== cachedUploads.testimonialAvatar.publicId) {
      await deleteCloudinaryImage(existing.avatarPublicId);
    }
    resetTestimonialForm();
    toast("Testimonial saved to website content.");
  }
}

function upsert(collection, item) {
  const index = collection.findIndex((entry) => entry.id === item.id);
  if (index >= 0) collection[index] = item;
  else collection.unshift(item);
}

function validateTournamentForm() {
  if (!$("#tournamentName").value.trim()) return invalid("Tournament name is required.");
  if ($("#tournamentDate").value && Number.isNaN(new Date(`${$("#tournamentDate").value}T00:00:00`).getTime())) {
    return invalid("Choose a valid tournament date.");
  }
  if (!validOptionalUrl($("#tournamentRegisterLink").value)) return invalid("Register link must start with https:// or http://.");
  if (!validOptionalUrl($("#tournamentCricLink").value)) return invalid("CricHeroes link must start with https:// or http://.");
  return valid();
}

function validateImageForm() {
  if (!$("#imageTitle").value.trim()) return invalid("Image title is required.");
  const id = $("#imageId").value;
  const existing = data.images.find((item) => item.id === id);
  if (!cachedUploads.imageFile?.url && !existing?.src) return invalid("Please upload an image.");
  return valid();
}

function validateSocialForm() {
  if (!$("#socialLabel").value.trim()) return invalid("Social label is required.");
  if (!isValidUrl($("#socialUrl").value)) return invalid("Social URL must be a valid link.");
  return valid();
}

function validateTestimonialForm() {
  if (!$("#testimonialName").value.trim()) return invalid("Testimonial name is required.");
  if (!$("#testimonialText").value.trim()) return invalid("Testimonial message is required.");
  return valid();
}

function valid() {
  return { ok: true };
}

function invalid(message) {
  return { ok: false, message };
}

function validOptionalUrl(value) {
  return !String(value || "").trim() || isValidUrl(value);
}

function isValidUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

async function updatePassword(event) {
  event.preventDefault();
  const currentPassword = $("#currentPassword").value;
  const newPassword = $("#newPassword").value;
  const confirmPassword = $("#confirmPassword").value;
  if (!currentPassword || !newPassword) {
    toast("Enter current and new password.");
    return;
  }
  if (newPassword.length < 8) {
    toast("New password must be at least 8 characters.");
    return;
  }
  if (newPassword !== confirmPassword) {
    toast("New passwords do not match.");
    return;
  }

  const response = await fetch(API_PASSWORD_UPDATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    toast(result.error || "Password update failed.");
    return;
  }
  $("#passwordForm").reset();
  toast("Password updated.");
}

async function sendResetEmail(event) {
  event.preventDefault();
  const email = $("#resetEmail").value.trim();
  if (!email) {
    toast("Enter the admin email.");
    return;
  }
  const response = await fetch(API_PASSWORD_RESET_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    toast(result.error || "Reset email failed.");
    return;
  }
  $("#resetEmailForm").reset();
  toast("Reset email sent if the address is allowed.");
}

async function deleteTournament() {
  const id = $("#tournamentId").value;
  const item = data.tournaments.find((entry) => entry.id === id);
  if (!id || !item || !confirm(`Delete ${item.name}?`)) return;
  data.tournaments = data.tournaments.filter((entry) => entry.id !== id);
  if (await saveData(`Deleted tournament: ${item.name}`)) {
    await deleteCloudinaryImage(item.posterPublicId);
    resetTournamentForm();
    toast("Tournament deleted.");
  }
}

async function deleteImage() {
  const id = $("#imageId").value;
  const item = data.images.find((entry) => entry.id === id);
  if (!id || !item || !confirm(`Delete ${item.title}?`)) return;
  data.images = data.images.filter((entry) => entry.id !== id);
  if (await saveData(`Deleted image: ${item.title}`)) {
    await deleteCloudinaryImage(item.publicId);
    resetImageForm();
    toast("Image deleted.");
  }
}

async function deleteSocial() {
  const id = $("#socialId").value;
  const item = data.socials.find((entry) => entry.id === id);
  if (!id || !item || !confirm(`Delete ${item.label}?`)) return;
  data.socials = data.socials.filter((entry) => entry.id !== id);
  if (await saveData(`Deleted social: ${item.label}`)) {
    resetSocialForm();
    toast("Social deleted.");
  }
}

async function deleteTestimonial() {
  const id = $("#testimonialId").value;
  const item = data.testimonials.find((entry) => entry.id === id);
  if (!id || !item || !confirm(`Delete ${item.name}?`)) return;
  data.testimonials = data.testimonials.filter((entry) => entry.id !== id);
  if (await saveData(`Deleted testimonial: ${item.name}`)) {
    await deleteCloudinaryImage(item.avatarPublicId);
    resetTestimonialForm();
    toast("Testimonial deleted.");
  }
}

function editTournament(id) {
  const item = data.tournaments.find((entry) => entry.id === id);
  if (!item) return;
  $("#tournamentId").value = item.id;
  $("#tournamentName").value = item.name;
  $("#tournamentStatus").value = item.status;
  $("#tournamentDate").value = item.date;
  $("#tournamentPrize").value = item.prize;
  $("#tournamentRegistration").value = item.registration;
  $("#tournamentDescription").value = item.description;
  $("#tournamentRules").value = (item.rules || []).join("\n");
  $("#tournamentRegisterLink").value = item.registerLink;
  $("#tournamentCricLink").value = item.cricLink;
  $("#tournamentOrder").value = item.order || "";
  $("#tournamentPublished").checked = item.published !== false;
  $("#tournamentFeatured").checked = item.featured === true;
  cachedUploads.tournamentPoster = null;
  renderImagePreview("#tournamentPosterPreview", item.poster);
  $("#tournamentFormTitle").textContent = "Edit tournament";
  $("#deleteTournamentBtn").hidden = false;
  $("#tournamentName").focus();
}

function editImage(id) {
  const item = data.images.find((entry) => entry.id === id);
  if (!item) return;
  $("#imageId").value = item.id;
  $("#imageTitle").value = item.title;
  $("#imagePlacement").value = item.placement;
  $("#imageAlt").value = item.alt;
  $("#imageOrder").value = item.order || "";
  $("#imagePublished").checked = item.published !== false;
  $("#imageFeatured").checked = item.featured === true;
  cachedUploads.imageFile = null;
  renderImagePreview("#imagePreview", item.src);
  $("#imageFormTitle").textContent = "Edit image";
  $("#deleteImageBtn").hidden = false;
  $("#imageTitle").focus();
}

function editSocial(id) {
  const item = data.socials.find((entry) => entry.id === id);
  if (!item) return;
  $("#socialId").value = item.id;
  $("#socialPlatform").value = item.platform;
  $("#socialLabel").value = item.label;
  $("#socialUrl").value = item.url;
  $("#socialOrder").value = item.order || "";
  $("#socialVisible").checked = item.visible;
  $("#socialFormTitle").textContent = "Edit social";
  $("#deleteSocialBtn").hidden = false;
  $("#socialLabel").focus();
}

function editTestimonial(id) {
  const item = data.testimonials.find((entry) => entry.id === id);
  if (!item) return;
  $("#testimonialId").value = item.id;
  $("#testimonialName").value = item.name;
  $("#testimonialRole").value = item.role;
  $("#testimonialText").value = item.text;
  $("#testimonialOrder").value = item.order || "";
  $("#testimonialPublished").checked = item.published !== false;
  $("#testimonialFeatured").checked = item.featured === true;
  $("#testimonialRating").value = item.rating;
  $("#ratingReadout").textContent = `${item.rating} stars`;
  cachedUploads.testimonialAvatar = null;
  renderImagePreview("#testimonialAvatarPreview", item.avatar);
  $("#testimonialFormTitle").textContent = "Edit testimonial";
  $("#deleteTestimonialBtn").hidden = false;
  $("#testimonialName").focus();
}

function resetTournamentForm() {
  $("#tournamentForm").reset();
  $("#tournamentId").value = "";
  cachedUploads.tournamentPoster = null;
  $("#tournamentFormTitle").textContent = "Add tournament";
  $("#tournamentPublished").checked = true;
  $("#tournamentFeatured").checked = false;
  $("#deleteTournamentBtn").hidden = true;
  $("#tournamentPosterPreview").textContent = "No poster selected";
}

function resetImageForm() {
  $("#imageForm").reset();
  $("#imageId").value = "";
  cachedUploads.imageFile = null;
  $("#imageFormTitle").textContent = "Add image";
  $("#imagePublished").checked = true;
  $("#imageFeatured").checked = false;
  $("#deleteImageBtn").hidden = true;
  $("#imagePreview").textContent = "No image selected";
}

function resetSocialForm() {
  $("#socialForm").reset();
  $("#socialId").value = "";
  $("#socialVisible").checked = true;
  $("#socialOrder").value = "";
  $("#socialFormTitle").textContent = "Add social";
  $("#deleteSocialBtn").hidden = true;
}

function resetTestimonialForm() {
  $("#testimonialForm").reset();
  $("#testimonialId").value = "";
  cachedUploads.testimonialAvatar = null;
  $("#testimonialRating").value = 5;
  $("#ratingReadout").textContent = "5 stars";
  $("#testimonialPublished").checked = true;
  $("#testimonialFeatured").checked = false;
  $("#testimonialFormTitle").textContent = "Add testimonial";
  $("#deleteTestimonialBtn").hidden = true;
  $("#testimonialAvatarPreview").textContent = "No avatar selected";
}

function renderAll() {
  renderSessionStatus();
  renderStats();
  renderActivity();
  renderQuickPreview();
  renderBookings();
  renderTournaments();
  renderImages();
  renderSocials();
  renderTestimonials();
}

function renderSessionStatus() {
  if ($("#storageMode")) {
    const storage = sessionInfo?.contentStorage || "checking";
    const images = sessionInfo?.imageStorage || "checking";
    $("#storageMode").textContent = `${storage} + ${images}`;
  }
  if ($("#storageNote")) {
    $("#storageNote").textContent = sessionInfo
      ? `Auth: ${sessionInfo.auth}. Bookings: ${sessionInfo.bookingStorage}. Forms: ${sessionInfo.forms}.`
      : "Could not read server status yet.";
  }
  if ($("#sessionStatus")) {
    const rows = [
      ["Signed in as", sessionInfo?.identity || "Unknown"],
      ["Login type", sessionInfo?.provider || "Unknown"],
      ["Content storage", sessionInfo?.contentStorage || "Unknown"],
      ["Booking storage", sessionInfo?.bookingStorage || "Unknown"],
      ["Booking retention", sessionInfo?.bookingRetentionDays ? `${sessionInfo.bookingRetentionDays} days` : "Manual deletion"],
      ["Image storage", sessionInfo?.imageStorage || "Unknown"],
      ["Forms", sessionInfo?.forms || "Unknown"]
    ];
    const container = $("#sessionStatus");
    clearElement(container);
    rows.forEach(([label, value]) => {
      const row = document.createElement("div");
      row.className = "status-row";
      appendTextElement(row, "span", label);
      appendTextElement(row, "strong", value);
      container.appendChild(row);
    });
  }
}

function renderStats() {
  $("#statBookings").textContent = bookings.length;
  $("#statTournaments").textContent = data.tournaments.length;
  $("#statImages").textContent = data.images.length;
  $("#statSocials").textContent = data.socials.length;
  $("#statTestimonials").textContent = data.testimonials.length;
}

function renderActivity() {
  const rows = auditEntries.length ? auditEntries : activity.map((entry) => ({
    action: entry.message,
    created_at: entry.time,
    actor: "This browser"
  }));
  const container = $("#activityList");
  clearElement(container);
  if (!rows.length) {
    appendEmptyState(container, "No audit activity yet. Save something and it will appear here.");
    return;
  }
  rows.slice(0, 12).forEach((entry) => {
    const item = document.createElement("div");
    item.className = "activity-item";
    appendTextElement(item, "strong", formatAuditAction(entry.action || entry.message));
    item.appendChild(document.createElement("br"));
    item.append(document.createTextNode(`${entry.actor || "Unknown"} · ${formatAuditTime(entry.created_at || entry.time)}`));
    container.appendChild(item);
  });
}

function formatAuditAction(action) {
  return String(action || "activity")
    .replaceAll(".", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatAuditTime(value) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function renderQuickPreview() {
  const nextTournament = sortByOrder(data.tournaments).find((item) => item.published !== false);
  const visibleSocials = data.socials.filter((social) => social.visible && social.published !== false).length;
  const container = $("#quickPreview");
  clearElement(container);
  [
    { label: "Bookings", labelClass: "red", title: `${bookings.filter((item) => item.status === "new").length} new requests`, meta: `${bookings.length} total` },
    { label: "Next", labelClass: "red", title: nextTournament?.name || "No tournaments", meta: nextTournament?.date || "Add a date" },
    { label: "Gallery", labelClass: "", title: `${data.images.length} managed images`, meta: "" },
    { label: "Social", labelClass: "", title: `${visibleSocials} visible social links`, meta: "" }
  ].forEach((item) => {
    const preview = document.createElement("div");
    preview.className = "preview-item";
    appendPill(preview, item.label, item.labelClass);
    appendTextElement(preview, "h3", item.title);
    if (item.meta) appendTextElement(preview, "p", item.meta, "item-meta");
    container.appendChild(preview);
  });
}

function receivedWithinPeriod(value, period) {
  if (period === "all") return true;
  const timestamp = new Date(value || 0).getTime();
  if (!Number.isFinite(timestamp)) return false;
  if (period === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return timestamp >= start.getTime();
  }
  return timestamp >= Date.now() - Number(period) * 24 * 60 * 60 * 1000;
}

function getFilteredBookings() {
  const query = $("#bookingSearch")?.value.toLowerCase().trim() || "";
  const status = $("#bookingStatusFilter")?.value || "all";
  const period = $("#bookingPeriodFilter")?.value || "all";
  const sort = $("#bookingSort")?.value || "newest";
  const items = bookings.filter((booking) => {
    const matchesStatus = status === "all" || booking.status === status;
    const searchable = [
      booking.reference, booking.fullname, booking.email, booking.phone,
      booking.booking_type, booking.booking_date, booking.booking_date_label,
      booking.time_slot, booking.tournament_name, booking.team_name,
      booking.notes, booking.admin_note
    ].join(" ").toLowerCase();
    return matchesStatus && receivedWithinPeriod(booking.created_at, period) && searchable.includes(query);
  });

  return items.sort((left, right) => {
    if (sort === "oldest") return new Date(left.created_at || 0) - new Date(right.created_at || 0);
    if (sort === "booking-date") {
      return String(left.booking_date || "9999-12-31").localeCompare(String(right.booking_date || "9999-12-31")) || new Date(right.created_at || 0) - new Date(left.created_at || 0);
    }
    if (sort === "name") return String(left.fullname || "").localeCompare(String(right.fullname || ""), undefined, { sensitivity: "base" });
    return new Date(right.created_at || 0) - new Date(left.created_at || 0);
  });
}

function renderBookingSummary() {
  const container = $("#bookingSummary");
  if (!container) return;
  const activeStatus = $("#bookingStatusFilter")?.value || "all";
  const summaries = [
    ["all", "All", bookings.length],
    ["new", "New", bookings.filter((item) => item.status === "new").length],
    ["contacted", "Contacted", bookings.filter((item) => item.status === "contacted").length],
    ["confirmed", "Confirmed", bookings.filter((item) => item.status === "confirmed").length],
    ["completed", "Completed", bookings.filter((item) => item.status === "completed").length]
  ];
  clearElement(container);
  summaries.forEach(([value, label, count]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `booking-summary-card${activeStatus === value ? " active" : ""}`;
    button.setAttribute("aria-pressed", String(activeStatus === value));
    appendTextElement(button, "span", label);
    appendTextElement(button, "strong", count);
    button.addEventListener("click", () => {
      $("#bookingStatusFilter").value = value;
      bookingPage = 1;
      renderBookings();
    });
    container.appendChild(button);
  });
}

function renderBookingPagination(total, pageSize) {
  const container = $("#bookingPagination");
  if (!container) return;
  clearElement(container);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return;

  const previous = document.createElement("button");
  previous.type = "button";
  previous.className = "btn btn-soft";
  previous.textContent = "Previous";
  previous.disabled = bookingPage <= 1;
  previous.addEventListener("click", () => {
    bookingPage -= 1;
    renderBookings();
    document.getElementById("bookings").scrollIntoView({ behavior: "smooth" });
  });

  appendTextElement(container, "span", `Page ${bookingPage} of ${totalPages}`);

  const next = document.createElement("button");
  next.type = "button";
  next.className = "btn btn-soft";
  next.textContent = "Next";
  next.disabled = bookingPage >= totalPages;
  next.addEventListener("click", () => {
    bookingPage += 1;
    renderBookings();
    document.getElementById("bookings").scrollIntoView({ behavior: "smooth" });
  });
  container.prepend(previous);
  container.appendChild(next);
}

function renderBookings() {
  const container = $("#bookingList");
  if (!container) return;
  renderBookingSummary();
  const filtered = getFilteredBookings();
  const pageSize = Number($("#bookingPageSize")?.value || 20);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  bookingPage = Math.min(Math.max(1, bookingPage), totalPages);
  const start = (bookingPage - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);
  const count = $("#bookingResultsCount");
  if (count) count.textContent = filtered.length ? `Showing ${start + 1}–${start + items.length} of ${filtered.length}` : "0 bookings";

  clearElement(container);
  if (!items.length) {
    appendEmptyState(container, bookings.length ? "No bookings match those filters." : "No booking requests yet.");
    renderBookingPagination(0, pageSize);
    return;
  }

  items.forEach((booking) => {
    const expanded = expandedBookingReferences.has(booking.reference);
    const article = document.createElement("article");
    article.className = `booking-card status-${booking.status || "new"}`;

    const head = document.createElement("div");
    head.className = "booking-head";
    const heading = document.createElement("div");
    appendTextElement(heading, "span", booking.reference || "No reference", "booking-reference");
    appendTextElement(heading, "h3", booking.fullname || "Unnamed booking");
    const pills = document.createElement("div");
    pills.className = "item-meta";
    appendPill(pills, booking.status || "new", ["new", "declined", "cancelled"].includes(booking.status) ? "red" : "");
    if (booking.admin_note) appendPill(pills, "Has note");
    if (booking.delivery_status === "failed") appendPill(pills, "Delivery failed", "red");
    heading.appendChild(pills);

    const headActions = document.createElement("div");
    headActions.className = "booking-head-actions";
    appendTextElement(headActions, "time", formatAuditTime(booking.created_at), "booking-time");
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "icon-btn booking-toggle";
    toggle.textContent = expanded ? "Close" : "Open";
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.addEventListener("click", () => {
      if (expanded) expandedBookingReferences.delete(booking.reference);
      else expandedBookingReferences.add(booking.reference);
      renderBookings();
    });
    headActions.appendChild(toggle);
    head.append(heading, headActions);

    const compact = document.createElement("div");
    compact.className = "booking-compact-meta";
    [
      booking.phone || "No phone",
      booking.booking_type || booking.tournament_name || booking.form_type || "Booking request",
      booking.booking_date_label || formatDate(booking.booking_date),
      booking.time_slot || "No preferred slot"
    ].forEach((value) => appendTextElement(compact, "span", value));
    article.append(head, compact);

    if (expanded) {
      const expandedContent = document.createElement("div");
      expandedContent.className = "booking-expanded";
      const details = document.createElement("dl");
      details.className = "booking-details";
      [
        ["Phone", booking.phone || "Not provided"],
        ["Email", booking.email || "Not provided"],
        ["Booking", booking.booking_type || booking.form_type || "Request"],
        ["Date", booking.booking_date_label || formatDate(booking.booking_date)],
        ["Preferred slot", booking.time_slot || "Not provided"],
        ["Tournament", booking.tournament_name || "Not applicable"],
        ["Team", booking.team_name || "Not provided"]
      ].forEach(([label, value]) => {
        const group = document.createElement("div");
        appendTextElement(group, "dt", label);
        appendTextElement(group, "dd", value);
        details.appendChild(group);
      });
      expandedContent.appendChild(details);

      if (booking.notes) {
        const notes = document.createElement("div");
        notes.className = "booking-notes";
        appendTextElement(notes, "strong", "Customer note");
        appendTextElement(notes, "p", booking.notes);
        expandedContent.appendChild(notes);
      }

      const controls = document.createElement("div");
      controls.className = "booking-controls";
      const statusLabel = document.createElement("label");
      statusLabel.append("Status");
      const statusSelect = document.createElement("select");
      ["new", "contacted", "confirmed", "declined", "completed", "cancelled"].forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value[0].toUpperCase() + value.slice(1);
        option.selected = value === booking.status;
        statusSelect.appendChild(option);
      });
      statusLabel.appendChild(statusSelect);

      const noteLabel = document.createElement("label");
      noteLabel.append("Internal note");
      const note = document.createElement("textarea");
      note.rows = 3;
      note.maxLength = 2000;
      note.placeholder = "Follow-up details for the HCC team";
      note.value = booking.admin_note || "";
      noteLabel.appendChild(note);

      const save = document.createElement("button");
      save.className = "btn btn-primary";
      save.type = "button";
      save.textContent = "Save update";
      save.addEventListener("click", () => updateBookingFromCard(booking.reference, statusSelect.value, note.value, save));
      const remove = document.createElement("button");
      remove.className = "btn btn-danger";
      remove.type = "button";
      remove.textContent = "Delete permanently";
      remove.addEventListener("click", () => deleteBookingFromCard(booking.reference, remove));
      const actions = document.createElement("div");
      actions.className = "booking-action-buttons";
      actions.append(save, remove);
      controls.append(statusLabel, noteLabel, actions);
      expandedContent.appendChild(controls);
      article.appendChild(expandedContent);
    }
    container.appendChild(article);
  });
  renderBookingPagination(filtered.length, pageSize);
}

function csvCell(value) {
  let text = String(value ?? "").replaceAll('"', '""');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text}"`;
}

function exportBookingsCsv() {
  const items = getFilteredBookings();
  if (!items.length) {
    toast("No filtered bookings to export.");
    return;
  }
  const fields = [
    ["Reference", "reference"], ["Received", "created_at"], ["Status", "status"],
    ["Name", "fullname"], ["Phone", "phone"], ["Email", "email"],
    ["Booking type", "booking_type"], ["Requested date", "booking_date"],
    ["Preferred slot", "time_slot"], ["Tournament", "tournament_name"],
    ["Team", "team_name"], ["Customer note", "notes"], ["Internal note", "admin_note"]
  ];
  const csv = [
    fields.map(([label]) => csvCell(label)).join(","),
    ...items.map((booking) => fields.map(([, key]) => csvCell(booking[key])).join(","))
  ].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `hcc-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast(`Exported ${items.length} bookings.`);
}

async function updateBookingFromCard(reference, status, adminNote, button) {
  if (!reference) return;
  button.disabled = true;
  button.textContent = "Saving…";
  try {
    const response = await fetch(`${API_BOOKINGS_URL}/${encodeURIComponent(reference)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, admin_note: adminNote })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Booking update failed.");
    const index = bookings.findIndex((item) => item.reference === reference);
    if (index >= 0) bookings[index] = result;
    await loadAuditEntries();
    renderAll();
    toast(`${reference} updated.`);
  } catch (error) {
    button.disabled = false;
    button.textContent = "Save update";
    toast(error.message || "Booking update failed.");
  }
}

async function deleteBookingFromCard(reference, button) {
  if (!reference || !confirm(`Permanently delete booking ${reference}? This cannot be undone.`)) return;
  button.disabled = true;
  button.textContent = "Deleting…";
  try {
    const response = await fetch(`${API_BOOKINGS_URL}/${encodeURIComponent(reference)}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Booking deletion failed.");
    bookings = bookings.filter((item) => item.reference !== reference);
    expandedBookingReferences.delete(reference);
    await loadAuditEntries();
    renderAll();
    toast(`${reference} permanently deleted.`);
  } catch (error) {
    button.disabled = false;
    button.textContent = "Delete permanently";
    toast(error.message || "Booking deletion failed.");
  }
}

function renderTournaments() {
  const query = $("#tournamentSearch").value?.toLowerCase() || "";
  const items = sortByOrder(data.tournaments).filter((item) => {
    return [item.name, item.status, item.date, item.prize, item.description].join(" ").toLowerCase().includes(query);
  });
  const container = $("#tournamentList");
  clearElement(container);
  if (!items.length) {
    appendEmptyState(container, "No tournaments found.");
    return;
  }
  items.forEach((item) => {
    const article = document.createElement("article");
    article.className = "item-card";
    article.dataset.id = item.id;

    const thumb = document.createElement("div");
    thumb.className = "item-thumb";
    if (item.poster) {
      const img = document.createElement("img");
      img.src = item.poster;
      img.alt = "";
      thumb.appendChild(img);
    } else {
      thumb.textContent = "HCC";
    }

    const body = document.createElement("div");
    appendTextElement(body, "h3", item.name, "item-title");
    const meta = document.createElement("div");
    meta.className = "item-meta";
    appendPill(meta, item.status, item.status === "ongoing" ? "red" : "");
    appendPill(meta, item.published === false ? "Hidden" : "Published", item.published === false ? "red" : "");
    if (item.featured) appendPill(meta, "Featured");
    appendTextElement(meta, "span", `Order ${item.order || "-"}`);
    appendTextElement(meta, "span", formatDate(item.date));
    appendTextElement(meta, "span", item.prize || "No prize");
    body.appendChild(meta);
    appendTextElement(body, "p", item.description || "No description", "item-meta");

    const actions = document.createElement("div");
    actions.className = "item-actions";
    const button = document.createElement("button");
    button.className = "icon-btn";
    button.type = "button";
    button.textContent = "Edit";
    button.addEventListener("click", () => editTournament(item.id));
    actions.appendChild(button);

    article.append(thumb, body, actions);
    container.appendChild(article);
  });
}

function renderImages() {
  const items = sortByOrder(data.images);
  const container = $("#imageList");
  clearElement(container);
  if (!items.length) {
    appendEmptyState(container, "No images added.");
    return;
  }
  items.forEach((item) => {
    const article = document.createElement("article");
    article.className = "image-card";
    article.dataset.id = item.id;

    const frame = document.createElement("div");
    frame.className = "image-frame";
    if (item.src) {
      const img = document.createElement("img");
      img.src = item.src;
      img.alt = item.alt || "";
      frame.appendChild(img);
    } else {
      frame.textContent = "Image";
    }

    const body = document.createElement("div");
    body.className = "image-card-body";
    appendTextElement(body, "h3", item.title);
    const meta = document.createElement("div");
    meta.className = "item-meta";
    appendPill(meta, item.placement);
    appendPill(meta, item.published === false ? "Hidden" : "Published", item.published === false ? "red" : "");
    if (item.featured) appendPill(meta, "Featured");
    appendTextElement(meta, "span", `Order ${item.order || "-"}`);
    body.appendChild(meta);
    const button = document.createElement("button");
    button.className = "icon-btn";
    button.type = "button";
    button.textContent = "Edit";
    button.addEventListener("click", () => editImage(item.id));
    body.appendChild(button);

    article.append(frame, body);
    container.appendChild(article);
  });
}

function renderSocials() {
  const items = sortByOrder(data.socials);
  const container = $("#socialList");
  clearElement(container);
  if (!items.length) {
    appendEmptyState(container, "No social links added.");
    return;
  }
  items.forEach((item) => {
    const article = document.createElement("article");
    article.className = "item-card no-media";
    article.dataset.id = item.id;

    const body = document.createElement("div");
    appendTextElement(body, "h3", item.label, "item-title");
    const meta = document.createElement("div");
    meta.className = "item-meta";
    appendPill(meta, item.platform);
    appendPill(meta, item.visible ? "Visible" : "Hidden", item.visible ? "" : "red");
    appendTextElement(meta, "span", `Order ${item.order || "-"}`);
    body.appendChild(meta);
    appendTextElement(body, "p", item.url, "item-meta");

    const actions = document.createElement("div");
    actions.className = "item-actions";
    const button = document.createElement("button");
    button.className = "icon-btn";
    button.type = "button";
    button.textContent = "Edit";
    button.addEventListener("click", () => editSocial(item.id));
    actions.appendChild(button);

    article.append(body, actions);
    container.appendChild(article);
  });
}

function renderTestimonials() {
  const items = sortByOrder(data.testimonials);
  const container = $("#testimonialList");
  clearElement(container);
  if (!items.length) {
    appendEmptyState(container, "No testimonials added.");
    return;
  }
  items.forEach((item) => {
    const article = document.createElement("article");
    article.className = "item-card";
    article.dataset.id = item.id;

    const thumb = document.createElement("div");
    thumb.className = "item-thumb";
    if (item.avatar) {
      const img = document.createElement("img");
      img.src = item.avatar;
      img.alt = "";
      thumb.appendChild(img);
    } else {
      thumb.textContent = initials(item.name);
    }

    const body = document.createElement("div");
    appendTextElement(body, "h3", item.name, "item-title");
    const meta = document.createElement("div");
    meta.className = "item-meta";
    appendPill(meta, `${item.rating}/5 stars`);
    appendPill(meta, item.published === false ? "Hidden" : "Published", item.published === false ? "red" : "");
    if (item.featured) appendPill(meta, "Featured");
    appendTextElement(meta, "span", `Order ${item.order || "-"}`);
    appendTextElement(meta, "span", item.role || "No role");
    body.appendChild(meta);
    appendTextElement(body, "p", item.text, "item-meta");

    const actions = document.createElement("div");
    actions.className = "item-actions";
    const button = document.createElement("button");
    button.className = "icon-btn";
    button.type = "button";
    button.textContent = "Edit";
    button.addEventListener("click", () => editTestimonial(item.id));
    actions.appendChild(button);

    article.append(thumb, body, actions);
    container.appendChild(article);
  });
}

function renderImagePreview(selector, src) {
  const preview = $(selector);
  if (!src) {
    preview.textContent = "No image selected";
    return;
  }
  clearElement(preview);
  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  preview.appendChild(img);
}

function exportJson() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `hcc-admin-content-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast("JSON exported.");
}

async function importJson(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    data = mergeDefaults(parsed);
    if (await saveData("Imported content JSON")) {
      resetTournamentForm();
      resetImageForm();
      resetSocialForm();
      resetTestimonialForm();
      toast("JSON imported and saved.");
    }
  } catch {
    toast("That JSON file could not be imported.");
  } finally {
    event.target.value = "";
  }
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDate(value) {
  if (!value) return "No date";
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function initials(name) {
  return (name || "HCC")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 2600);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value = "") {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
