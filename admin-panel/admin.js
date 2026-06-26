const ACTIVITY_KEY = "hcc-admin-activity-v1";
const API_CONTENT_URL = "/api/content";
const API_UPLOAD_URL = "/api/upload";
const API_SESSION_URL = "/api/session";
const API_CLOUDINARY_DELETE_URL = "/api/cloudinary/delete";
const API_PASSWORD_UPDATE_URL = "/api/password-update";
const API_PASSWORD_RESET_URL = "/api/password-reset";

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
      src: "hero-bg-cricket.png"
    },
    {
      id: "img-logo",
      title: "HCC Logo",
      placement: "sponsor",
      alt: "Hamriyah Cricket Centre logo",
      src: "logo.png"
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
let sessionInfo = null;
let cachedUploads = {
  tournamentPoster: null,
  imageFile: null,
  testimonialAvatar: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", async () => {
  bindNavigation();
  bindForms();
  bindToolbar();
  bindFileInputs();
  await loadSession();
  await loadData();
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
  $("#clearActivityBtn").addEventListener("click", () => {
    activity = [];
    localStorage.removeItem(ACTIVITY_KEY);
    renderActivity();
    toast("Activity cleared.");
  });

  $("#tournamentSearch").addEventListener("input", renderTournaments);
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
      ? `Auth: ${sessionInfo.auth}. Forms: ${sessionInfo.forms}.`
      : "Could not read server status yet.";
  }
  if ($("#sessionStatus")) {
    const rows = [
      ["Signed in as", sessionInfo?.identity || "Unknown"],
      ["Login type", sessionInfo?.provider || "Unknown"],
      ["Content storage", sessionInfo?.contentStorage || "Unknown"],
      ["Image storage", sessionInfo?.imageStorage || "Unknown"],
      ["Forms", sessionInfo?.forms || "Unknown"]
    ];
    $("#sessionStatus").innerHTML = rows.map(([label, value]) => `
      <div class="status-row">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `).join("");
  }
}

function renderStats() {
  $("#statTournaments").textContent = data.tournaments.length;
  $("#statImages").textContent = data.images.length;
  $("#statSocials").textContent = data.socials.length;
  $("#statTestimonials").textContent = data.testimonials.length;
}

function renderActivity() {
  $("#activityList").innerHTML = activity.length
    ? activity.map((entry) => `<div class="activity-item"><strong>${escapeHtml(entry.message)}</strong><br>${escapeHtml(entry.time)}</div>`).join("")
    : `<div class="empty">No activity yet. Save something and it will appear here.</div>`;
}

function renderQuickPreview() {
  const nextTournament = sortByOrder(data.tournaments).find((item) => item.published !== false);
  const visibleSocials = data.socials.filter((social) => social.visible && social.published !== false).length;
  $("#quickPreview").innerHTML = `
    <div class="preview-item"><span class="pill red">Next</span><h3>${escapeHtml(nextTournament?.name || "No tournaments")}</h3><p class="item-meta">${escapeHtml(nextTournament?.date || "Add a date")}</p></div>
    <div class="preview-item"><span class="pill">Gallery</span><h3>${data.images.length} managed images</h3></div>
    <div class="preview-item"><span class="pill">Social</span><h3>${visibleSocials} visible social links</h3></div>
  `;
}

function renderTournaments() {
  const query = $("#tournamentSearch").value?.toLowerCase() || "";
  const items = sortByOrder(data.tournaments).filter((item) => {
    return [item.name, item.status, item.date, item.prize, item.description].join(" ").toLowerCase().includes(query);
  });

  $("#tournamentList").innerHTML = items.length
    ? items.map((item) => `
      <article class="item-card" data-id="${escapeAttr(item.id)}">
        <div class="item-thumb">${item.poster ? `<img src="${escapeAttr(item.poster)}" alt="">` : "HCC"}</div>
        <div>
          <h3 class="item-title">${escapeHtml(item.name)}</h3>
          <div class="item-meta">
            <span class="pill ${item.status === "ongoing" ? "red" : ""}">${escapeHtml(item.status)}</span>
            <span class="pill ${item.published === false ? "red" : ""}">${item.published === false ? "Hidden" : "Published"}</span>
            ${item.featured ? `<span class="pill">Featured</span>` : ""}
            <span>Order ${escapeHtml(item.order || "-")}</span>
            <span>${formatDate(item.date)}</span>
            <span>${escapeHtml(item.prize || "No prize")}</span>
          </div>
          <p class="item-meta">${escapeHtml(item.description || "No description")}</p>
        </div>
        <div class="item-actions">
          <button class="icon-btn" type="button" onclick="editTournament('${escapeAttr(item.id)}')">Edit</button>
        </div>
      </article>
    `).join("")
    : `<div class="empty">No tournaments found.</div>`;
}

function renderImages() {
  const items = sortByOrder(data.images);
  $("#imageList").innerHTML = items.length
    ? items.map((item) => `
      <article class="image-card" data-id="${escapeAttr(item.id)}">
        <div class="image-frame">${item.src ? `<img src="${escapeAttr(item.src)}" alt="${escapeAttr(item.alt)}">` : "Image"}</div>
        <div class="image-card-body">
          <h3>${escapeHtml(item.title)}</h3>
          <div class="item-meta">
            <span class="pill">${escapeHtml(item.placement)}</span>
            <span class="pill ${item.published === false ? "red" : ""}">${item.published === false ? "Hidden" : "Published"}</span>
            ${item.featured ? `<span class="pill">Featured</span>` : ""}
            <span>Order ${escapeHtml(item.order || "-")}</span>
          </div>
          <button class="icon-btn" type="button" onclick="editImage('${escapeAttr(item.id)}')">Edit</button>
        </div>
      </article>
    `).join("")
    : `<div class="empty">No images added.</div>`;
}

function renderSocials() {
  const items = sortByOrder(data.socials);
  $("#socialList").innerHTML = items.length
    ? items.map((item) => `
      <article class="item-card no-media" data-id="${escapeAttr(item.id)}">
        <div>
          <h3 class="item-title">${escapeHtml(item.label)}</h3>
          <div class="item-meta">
            <span class="pill">${escapeHtml(item.platform)}</span>
            <span class="pill ${item.visible ? "" : "red"}">${item.visible ? "Visible" : "Hidden"}</span>
            <span>Order ${escapeHtml(item.order || "-")}</span>
          </div>
          <p class="item-meta">${escapeHtml(item.url)}</p>
        </div>
        <div class="item-actions">
          <button class="icon-btn" type="button" onclick="editSocial('${escapeAttr(item.id)}')">Edit</button>
        </div>
      </article>
    `).join("")
    : `<div class="empty">No social links added.</div>`;
}

function renderTestimonials() {
  const items = sortByOrder(data.testimonials);
  $("#testimonialList").innerHTML = items.length
    ? items.map((item) => `
      <article class="item-card" data-id="${escapeAttr(item.id)}">
        <div class="item-thumb">${item.avatar ? `<img src="${escapeAttr(item.avatar)}" alt="">` : initials(item.name)}</div>
        <div>
          <h3 class="item-title">${escapeHtml(item.name)}</h3>
          <div class="item-meta">
            <span class="pill">${item.rating}/5 stars</span>
            <span class="pill ${item.published === false ? "red" : ""}">${item.published === false ? "Hidden" : "Published"}</span>
            ${item.featured ? `<span class="pill">Featured</span>` : ""}
            <span>Order ${escapeHtml(item.order || "-")}</span>
            <span>${escapeHtml(item.role || "No role")}</span>
          </div>
          <p class="item-meta">${escapeHtml(item.text)}</p>
        </div>
        <div class="item-actions">
          <button class="icon-btn" type="button" onclick="editTestimonial('${escapeAttr(item.id)}')">Edit</button>
        </div>
      </article>
    `).join("")
    : `<div class="empty">No testimonials added.</div>`;
}

function renderImagePreview(selector, src) {
  const preview = $(selector);
  if (!src) {
    preview.textContent = "No image selected";
    return;
  }
  preview.innerHTML = `<img src="${escapeAttr(src)}" alt="">`;
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
