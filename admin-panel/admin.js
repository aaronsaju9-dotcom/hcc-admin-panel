const ACTIVITY_KEY = "hcc-admin-activity-v1";
const API_CONTENT_URL = "/api/content";
const API_UPLOAD_URL = "/api/upload";

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
let cachedUploads = {
  tournamentPoster: "",
  imageFile: "",
  testimonialAvatar: ""
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", async () => {
  bindNavigation();
  bindForms();
  bindToolbar();
  bindFileInputs();
  await loadData();
  renderAll();
  routeFromHash();
});

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
      cachedUploads[cacheKey] = upload.url;
      renderImagePreview(previewSelector, upload.url);
      toast(upload.provider === "cloudinary" ? "Image uploaded to Cloudinary." : "Image ready locally. Configure Cloudinary for production storage.");
    } catch (error) {
      cachedUploads[cacheKey] = "";
      event.target.value = "";
      $(previewSelector).textContent = "Upload failed";
      toast(error.message || "Image upload failed.");
    }
  });
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
    poster: cachedUploads.tournamentPoster || existing?.poster || ""
  };
  upsert(data.tournaments, item);
  if (await saveData(`${existing ? "Updated" : "Added"} tournament: ${item.name}`)) {
    resetTournamentForm();
    toast("Tournament saved to website content.");
  }
}

async function saveImage(event) {
  event.preventDefault();
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
    src: cachedUploads.imageFile || existing?.src || ""
  };
  upsert(data.images, item);
  if (await saveData(`${existing ? "Updated" : "Added"} image: ${item.title}`)) {
    resetImageForm();
    toast("Image saved to website content.");
  }
}

async function saveSocial(event) {
  event.preventDefault();
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
    avatar: cachedUploads.testimonialAvatar || existing?.avatar || ""
  };
  upsert(data.testimonials, item);
  if (await saveData(`${existing ? "Updated" : "Added"} testimonial: ${item.name}`)) {
    resetTestimonialForm();
    toast("Testimonial saved to website content.");
  }
}

function upsert(collection, item) {
  const index = collection.findIndex((entry) => entry.id === item.id);
  if (index >= 0) collection[index] = item;
  else collection.unshift(item);
}

async function deleteTournament() {
  const id = $("#tournamentId").value;
  const item = data.tournaments.find((entry) => entry.id === id);
  if (!id || !item || !confirm(`Delete ${item.name}?`)) return;
  data.tournaments = data.tournaments.filter((entry) => entry.id !== id);
  if (await saveData(`Deleted tournament: ${item.name}`)) {
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
  cachedUploads.tournamentPoster = "";
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
  cachedUploads.imageFile = "";
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
  cachedUploads.testimonialAvatar = "";
  renderImagePreview("#testimonialAvatarPreview", item.avatar);
  $("#testimonialFormTitle").textContent = "Edit testimonial";
  $("#deleteTestimonialBtn").hidden = false;
  $("#testimonialName").focus();
}

function resetTournamentForm() {
  $("#tournamentForm").reset();
  $("#tournamentId").value = "";
  cachedUploads.tournamentPoster = "";
  $("#tournamentFormTitle").textContent = "Add tournament";
  $("#tournamentPublished").checked = true;
  $("#tournamentFeatured").checked = false;
  $("#deleteTournamentBtn").hidden = true;
  $("#tournamentPosterPreview").textContent = "No poster selected";
}

function resetImageForm() {
  $("#imageForm").reset();
  $("#imageId").value = "";
  cachedUploads.imageFile = "";
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
  cachedUploads.testimonialAvatar = "";
  $("#testimonialRating").value = 5;
  $("#ratingReadout").textContent = "5 stars";
  $("#testimonialPublished").checked = true;
  $("#testimonialFeatured").checked = false;
  $("#testimonialFormTitle").textContent = "Add testimonial";
  $("#deleteTestimonialBtn").hidden = true;
  $("#testimonialAvatarPreview").textContent = "No avatar selected";
}

function renderAll() {
  renderStats();
  renderActivity();
  renderQuickPreview();
  renderTournaments();
  renderImages();
  renderSocials();
  renderTestimonials();
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
