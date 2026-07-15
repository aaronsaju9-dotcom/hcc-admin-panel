const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8765);
const ROOT = path.resolve(__dirname);
const DATA_DIR = process.env.HCC_DATA_DIR ? path.resolve(process.env.HCC_DATA_DIR) : path.join(ROOT, "data");
const CONTENT_FILE = path.join(DATA_DIR, "content.json");
const AUDIT_FILE = path.join(DATA_DIR, "audit.json");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SESSION_SECRET = process.env.SESSION_SECRET || (IS_PRODUCTION ? "" : crypto.randomBytes(32).toString("hex"));
const SESSION_COOKIE = "hcc_admin_session";
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_CONTENT_TABLE = process.env.SUPABASE_CONTENT_TABLE || "hcc_site_content";
const SUPABASE_AUDIT_TABLE = process.env.SUPABASE_AUDIT_TABLE || "hcc_admin_audit";
const SUPABASE_BOOKINGS_TABLE = process.env.SUPABASE_BOOKINGS_TABLE || "hcc_bookings";
const CONTENT_RECORD_ID = process.env.CONTENT_RECORD_ID || "main";
const SUPABASE_AUTH_ENABLED = process.env.SUPABASE_AUTH_ENABLED === "true";
const ALLOW_LOCAL_ADMIN = process.env.ALLOW_LOCAL_ADMIN === "true";
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "";
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "";
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "";
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "hcc-website";
const FORMSPREE_ENDPOINT = process.env.FORMSPREE_ENDPOINT || "";
const BOOKING_RETENTION_DAYS_VALUE = Number(process.env.BOOKING_RETENTION_DAYS || 0);
const BOOKING_RETENTION_DAYS = Number.isFinite(BOOKING_RETENTION_DAYS_VALUE) ? Math.floor(Math.max(0, BOOKING_RETENTION_DAYS_VALUE)) : 0;
const TRUST_PROXY = process.env.TRUST_PROXY === "true";
const PUBLIC_ORIGIN = parseOrigin(process.env.PUBLIC_ORIGIN || "");
const SESSION_TTL_MS = Math.max(1, Number(process.env.ADMIN_SESSION_HOURS || 8)) * 60 * 60 * 1000;
const MAX_JSON_BYTES = 30 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const rateLimits = new Map();

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}

function parseOrigin(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    return /^https?:$/.test(parsed.protocol) ? parsed.origin : "";
  } catch {
    return "";
  }
}

function getTrustedOrigin(request) {
  if (PUBLIC_ORIGIN) return PUBLIC_ORIGIN;
  if (IS_PRODUCTION) {
    throw new Error("PUBLIC_ORIGIN must be configured in production.");
  }
  return getRequestOrigin(request);
}

function validateStartupConfig() {
  const issues = [];
  if (IS_PRODUCTION && !SESSION_SECRET) {
    issues.push("SESSION_SECRET must be configured in production.");
  }
  if (IS_PRODUCTION && !PUBLIC_ORIGIN) {
    issues.push("PUBLIC_ORIGIN must be configured in production.");
  }
  if (ALLOW_LOCAL_ADMIN && !ADMIN_PASSWORD) {
    issues.push("ADMIN_PASSWORD must be configured when ALLOW_LOCAL_ADMIN=true.");
  }
  if (issues.length) {
    throw new Error(issues.join(" "));
  }
}

const publicFiles = new Map([
  ["/site.html", path.resolve(ROOT, "site.html")],
  ["/logo.webp", path.resolve(ROOT, "logo.webp")],
  ["/hero-bg-cricket.webp", path.resolve(ROOT, "hero-bg-cricket.webp")],
  ["/hero-cricket.mp4", path.resolve(ROOT, "hero-cricket.mp4")],
  ["/index.html", path.resolve(ROOT, "index.html")],
  ["/admin.css", path.resolve(ROOT, "admin.css")],
  ["/admin.js", path.resolve(ROOT, "admin.js")]
]);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webp": "image/webp"
};

const fallbackContent = {
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

function hasSupabaseConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function hasCloudinaryConfig() {
  return Boolean(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);
}

function normalizeContent(content) {
  return {
    tournaments: normalizeItems(content.tournaments),
    images: normalizeItems(content.images),
    socials: normalizeItems(content.socials),
    testimonials: normalizeItems(content.testimonials)
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

function getClientIp(request) {
  if (TRUST_PROXY && request.headers["x-forwarded-for"]) {
    return String(request.headers["x-forwarded-for"]).split(",")[0].trim();
  }
  return request.socket.remoteAddress || "unknown";
}

function checkRateLimit(request, bucket, limit, windowMs) {
  const key = `${bucket}:${getClientIp(request)}`;
  const now = Date.now();
  const entry = rateLimits.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }
  entry.count += 1;
  rateLimits.set(key, entry);
  return entry.count <= limit;
}

function commonHeaders(extra = {}) {
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' https:",
    "connect-src 'self'",
    "frame-src https://www.google.com https://maps.google.com",
    ...(IS_PRODUCTION ? ["upgrade-insecure-requests"] : [])
  ].join("; ");

  return {
    "Content-Security-Policy": contentSecurityPolicy,
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "X-Permitted-Cross-Domain-Policies": "none",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    ...(IS_PRODUCTION ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" } : {}),
    ...extra
  };
}

function ensureContentFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CONTENT_FILE)) {
    fs.writeFileSync(CONTENT_FILE, JSON.stringify(fallbackContent, null, 2));
  }
}

function readLocalBookings() {
  ensureContentFile();
  if (!fs.existsSync(BOOKINGS_FILE)) fs.writeFileSync(BOOKINGS_FILE, "[]");
  try {
    const rows = JSON.parse(fs.readFileSync(BOOKINGS_FILE, "utf8"));
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function writeLocalBookings(rows) {
  ensureContentFile();
  const normalized = Array.isArray(rows) ? rows.slice(0, 5000) : [];
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(normalized, null, 2));
  return normalized;
}

function readLocalContent() {
  ensureContentFile();
  return JSON.parse(fs.readFileSync(CONTENT_FILE, "utf8"));
}

function writeLocalContent(content) {
  ensureContentFile();
  const normalized = normalizeContent(content);
  fs.writeFileSync(CONTENT_FILE, JSON.stringify(normalized, null, 2));
  return normalized;
}

async function supabaseRequest(pathname, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase ${response.status}: ${detail}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function readSupabaseContent() {
  const rows = await supabaseRequest(`${SUPABASE_CONTENT_TABLE}?id=eq.${encodeURIComponent(CONTENT_RECORD_ID)}&select=content&limit=1`);
  if (Array.isArray(rows) && rows[0] && rows[0].content) return normalizeContent(rows[0].content);

  const seeded = await writeSupabaseContent(readLocalContent());
  return seeded;
}

async function writeSupabaseContent(content) {
  const normalized = normalizeContent(content);
  const rows = await supabaseRequest(`${SUPABASE_CONTENT_TABLE}?on_conflict=id`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify({
      id: CONTENT_RECORD_ID,
      content: normalized,
      updated_at: new Date().toISOString()
    })
  });
  return normalizeContent(Array.isArray(rows) && rows[0] && rows[0].content ? rows[0].content : normalized);
}

async function readContent() {
  return hasSupabaseConfig() ? readSupabaseContent() : readLocalContent();
}

async function writeContent(content) {
  return hasSupabaseConfig() ? writeSupabaseContent(content) : writeLocalContent(content);
}

function createBookingReference(now = new Date()) {
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `HCC-${date}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

async function readBookings() {
  await purgeExpiredBookings();
  if (!hasSupabaseConfig()) return readLocalBookings();
  const rows = await supabaseRequest(`${SUPABASE_BOOKINGS_TABLE}?select=*&order=created_at.desc&limit=1000`);
  return Array.isArray(rows) ? rows : [];
}

async function findBookingForCustomer(reference, email) {
  await purgeExpiredBookings();
  let booking;
  if (hasSupabaseConfig()) {
    const rows = await supabaseRequest(`${SUPABASE_BOOKINGS_TABLE}?reference=eq.${encodeURIComponent(reference)}&select=reference,status,updated_at,form_type,booking_type,booking_date,booking_date_label,time_slot,tournament_name,email&limit=1`);
    booking = Array.isArray(rows) ? rows[0] : null;
  } else {
    booking = readLocalBookings().find((item) => item.reference === reference);
  }
  if (!booking || String(booking.email || "").trim().toLowerCase() !== email) return null;
  return {
    reference: booking.reference,
    status: booking.status,
    updated_at: booking.updated_at,
    form_type: booking.form_type,
    booking_type: booking.booking_type,
    booking_date: booking.booking_date,
    booking_date_label: booking.booking_date_label,
    time_slot: booking.time_slot,
    tournament_name: booking.tournament_name
  };
}

async function deleteBooking(reference) {
  if (hasSupabaseConfig()) {
    const rows = await supabaseRequest(`${SUPABASE_BOOKINGS_TABLE}?reference=eq.${encodeURIComponent(reference)}`, {
      method: "DELETE",
      headers: { Prefer: "return=representation" }
    });
    if (!Array.isArray(rows) || !rows[0]) throw new ValidationError("Booking not found.");
    return rows[0];
  }
  const rows = readLocalBookings();
  const booking = rows.find((item) => item.reference === reference);
  if (!booking) throw new ValidationError("Booking not found.");
  writeLocalBookings(rows.filter((item) => item.reference !== reference));
  return booking;
}

async function purgeExpiredBookings() {
  if (!BOOKING_RETENTION_DAYS) return 0;
  const cutoff = new Date(Date.now() - BOOKING_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  if (hasSupabaseConfig()) {
    const rows = await supabaseRequest(`${SUPABASE_BOOKINGS_TABLE}?created_at=lt.${encodeURIComponent(cutoff.toISOString())}`, {
      method: "DELETE",
      headers: { Prefer: "return=representation" }
    });
    return Array.isArray(rows) ? rows.length : 0;
  }
  const rows = readLocalBookings();
  const kept = rows.filter((item) => {
    const createdAt = new Date(item.created_at || 0).getTime();
    return !Number.isFinite(createdAt) || createdAt >= cutoff.getTime();
  });
  if (kept.length !== rows.length) writeLocalBookings(kept);
  return rows.length - kept.length;
}

async function createBooking(payload) {
  const now = new Date().toISOString();
  const booking = {
    reference: createBookingReference(),
    created_at: now,
    updated_at: now,
    status: "new",
    delivery_status: "pending",
    form_type: payload.form_type || "Booking Request",
    fullname: payload.fullname || payload.captain_name || "",
    email: String(payload.email || "").trim().toLowerCase(),
    phone: payload.phone || "",
    booking_type: payload.booking_type || "",
    booking_date: payload.booking_date || "",
    booking_date_label: payload.booking_date_label || "",
    time_slot: payload.time_slot || "",
    tournament_name: payload.tournament_name || "",
    team_name: payload.team_name || "",
    notes: payload.notes || "",
    admin_note: ""
  };

  if (hasSupabaseConfig()) {
    const rows = await supabaseRequest(SUPABASE_BOOKINGS_TABLE, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(booking)
    });
    return Array.isArray(rows) && rows[0] ? rows[0] : booking;
  }
  writeLocalBookings([booking, ...readLocalBookings()]);
  return booking;
}

async function updateBooking(reference, changes) {
  const allowedStatuses = new Set(["new", "contacted", "confirmed", "declined", "completed", "cancelled"]);
  const patch = { updated_at: new Date().toISOString() };
  if (changes.status !== undefined) {
    if (!allowedStatuses.has(changes.status)) throw new Error("Invalid booking status.");
    patch.status = changes.status;
  }
  if (changes.delivery_status !== undefined) {
    if (!new Set(["pending", "sent", "failed"]).has(changes.delivery_status)) throw new Error("Invalid delivery status.");
    patch.delivery_status = changes.delivery_status;
  }
  if (changes.admin_note !== undefined) patch.admin_note = String(changes.admin_note || "").trim().slice(0, 2000);

  if (hasSupabaseConfig()) {
    const rows = await supabaseRequest(`${SUPABASE_BOOKINGS_TABLE}?reference=eq.${encodeURIComponent(reference)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch)
    });
    if (!Array.isArray(rows) || !rows[0]) throw new Error("Booking not found.");
    return rows[0];
  }
  const rows = readLocalBookings();
  const index = rows.findIndex((item) => item.reference === reference);
  if (index < 0) throw new Error("Booking not found.");
  rows[index] = { ...rows[index], ...patch };
  writeLocalBookings(rows);
  return rows[index];
}

function readLocalAudit() {
  ensureContentFile();
  if (!fs.existsSync(AUDIT_FILE)) fs.writeFileSync(AUDIT_FILE, "[]");
  try {
    const rows = JSON.parse(fs.readFileSync(AUDIT_FILE, "utf8"));
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function writeLocalAudit(rows) {
  ensureContentFile();
  const trimmed = Array.isArray(rows) ? rows.slice(0, 200) : [];
  fs.writeFileSync(AUDIT_FILE, JSON.stringify(trimmed, null, 2));
  return trimmed;
}

async function readAuditLog() {
  if (!hasSupabaseConfig()) return readLocalAudit();
  try {
    const rows = await supabaseRequest(`${SUPABASE_AUDIT_TABLE}?select=*&order=created_at.desc&limit=100`);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return readLocalAudit();
  }
}

async function logAudit(request, action, detail = {}) {
  const session = getSession(request);
  const entry = {
    id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
    actor: session?.identity || (isBasicAuthorized(request) ? ADMIN_USER : "system"),
    action,
    detail,
    ip: getClientIp(request)
  };

  const localRows = [entry, ...readLocalAudit()];
  writeLocalAudit(localRows);

  if (hasSupabaseConfig()) {
    try {
      await supabaseRequest(SUPABASE_AUDIT_TABLE, {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(entry)
      });
    } catch {
      // Audit logging must never break content edits.
    }
  }
  return entry;
}

function clearAuditLog() {
  writeLocalAudit([]);
}

function sendJson(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, {
    ...commonHeaders({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    })
  });
  response.end(JSON.stringify(payload, null, 2));
}

function getStaticCacheControl(extname) {
  if ([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".mp4"].includes(extname)) {
    return "public, max-age=31536000, immutable";
  }
  if ([".css", ".js"].includes(extname)) {
    return "public, max-age=86400";
  }
  return "public, max-age=3600";
}

function makeCloudinarySignature(params) {
  const crypto = require("crypto");
  const toSign = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== "")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return crypto.createHash("sha1").update(`${toSign}${CLOUDINARY_API_SECRET}`).digest("hex");
}

async function uploadImageToCloudinary({ file, filename, context }) {
  if (!hasCloudinaryConfig()) {
    return {
      url: file,
      provider: "local-fallback",
      warning: "Cloudinary is not configured. Image was kept as local data."
    };
  }

  if (!String(file || "").startsWith("data:image/")) {
    throw new Error("Only image data URLs can be uploaded.");
  }

  const size = estimateDataUrlBytes(file);
  if (size > MAX_IMAGE_BYTES) {
    throw new Error("Image is too large. Please upload an image under 8 MB.");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `${CLOUDINARY_FOLDER}/${context || "uploads"}`;
  const publicId = String(filename || `image-${Date.now()}`)
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80) || `image-${Date.now()}`;
  const signatureParams = { folder, public_id: publicId, timestamp };
  const signature = makeCloudinarySignature(signatureParams);
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", CLOUDINARY_API_KEY);
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("public_id", publicId);
  form.append("signature", signature);

  const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: "POST",
    body: form
  });

  const result = await uploadResponse.json();
  if (!uploadResponse.ok) {
    throw new Error(result.error && result.error.message ? result.error.message : "Cloudinary upload failed");
  }

  return {
    url: result.secure_url,
    provider: "cloudinary",
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    format: result.format
  };
}

function estimateDataUrlBytes(dataUrl) {
  const base64 = String(dataUrl || "").split(",")[1] || "";
  return Math.ceil((base64.length * 3) / 4);
}

async function deleteCloudinaryImage(publicId) {
  if (!hasCloudinaryConfig()) return { ok: true, skipped: true };
  const cleanPublicId = String(publicId || "").trim();
  if (!cleanPublicId) return { ok: true, skipped: true };

  const timestamp = Math.floor(Date.now() / 1000);
  const signatureParams = { public_id: cleanPublicId, timestamp };
  const signature = makeCloudinarySignature(signatureParams);
  const form = new FormData();
  form.append("public_id", cleanPublicId);
  form.append("api_key", CLOUDINARY_API_KEY);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);

  const destroyResponse = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`, {
    method: "POST",
    body: form
  });
  const result = await destroyResponse.json().catch(() => ({}));
  if (!destroyResponse.ok) {
    throw new Error(result.error && result.error.message ? result.error.message : "Cloudinary delete failed");
  }
  return { ok: true, result: result.result || "ok" };
}

async function forwardFormSubmission(payload) {
  const normalized = normalizeFormSubmission(payload);
  if (normalized.spam) return { ok: true };

  if (!FORMSPREE_ENDPOINT) {
    throw new Error("Form endpoint is not configured.");
  }

  const booking = await createBooking(normalized.payload);
  const formPayload = {
    ...normalized.payload,
    booking_reference: booking.reference,
    notes: [`Booking reference: ${booking.reference}`, normalized.payload.notes].filter(Boolean).join("\n")
  };

  try {
    const response = await fetch(FORMSPREE_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(formPayload)
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || result.message || "Form submission failed.");
    }
    await updateBooking(booking.reference, { delivery_status: "sent" });
    return { ok: true, reference: booking.reference, deliveryStatus: "sent" };
  } catch (error) {
    await updateBooking(booking.reference, { delivery_status: "failed" }).catch(() => {});
    return {
      ok: true,
      reference: booking.reference,
      deliveryStatus: "failed",
      warning: "Your request was saved, but the staff email notification is delayed. HCC can still manage it from the booking dashboard."
    };
  }
}

function normalizeFormSubmission(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ValidationError("Invalid form submission.");
  }
  if (String(payload.website || "").trim()) return { spam: true, payload: {} };

  const allowedFields = new Set([
    "form_type", "fullname", "phone", "email", "booking_type", "booking_date",
    "time_slot", "notes", "tournament_name", "team_name", "captain_name",
    "squad_size", "tournament_selection", "booking_date_label", "client_reference"
  ]);
  const cleanPayload = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!allowedFields.has(key)) continue;
    const limit = key === "notes" ? 2000 : 250;
    cleanPayload[key] = String(value ?? "").trim().slice(0, limit);
  }

  if (!new Set(["Slot Booking", "Tournament Registration"]).has(cleanPayload.form_type)) {
    throw new ValidationError("Unsupported form type.");
  }
  if (!cleanPayload.form_type || !cleanPayload.phone || !cleanPayload.email) {
    throw new ValidationError("Required form details are missing.");
  }
  const phoneDigits = cleanPayload.phone.replace(/\D/g, "");
  if (!/^\+?[\d\s().-]+$/.test(cleanPayload.phone) || phoneDigits.length < 7 || phoneDigits.length > 15) {
    throw new ValidationError("Enter a valid phone number.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanPayload.email)) {
    throw new ValidationError("Enter a valid email address.");
  }
  if (cleanPayload.form_type === "Slot Booking" && (!cleanPayload.fullname || !cleanPayload.booking_date)) {
    throw new ValidationError("Required booking details are missing.");
  }
  if (cleanPayload.booking_date && !/^\d{4}-\d{2}-\d{2}$/.test(cleanPayload.booking_date)) {
    throw new ValidationError("Enter a valid booking date.");
  }
  if (cleanPayload.form_type === "Tournament Registration" && (!cleanPayload.team_name || !cleanPayload.captain_name)) {
    throw new ValidationError("Required tournament details are missing.");
  }
  return { spam: false, payload: cleanPayload };
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return require("crypto").timingSafeEqual(left, right);
}

function signSession(value) {
  return crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(value)
    .digest("hex");
}

function makeSessionObjectValue(session) {
  const issuedAt = Date.now();
  const payload = Buffer.from(JSON.stringify({
    ...session,
    issuedAt,
    expiresAt: issuedAt + SESSION_TTL_MS
  })).toString("base64url");
  return `${payload}.${signSession(payload)}`;
}

function localAdminEnabled() {
  return Boolean(ADMIN_PASSWORD) && (!SUPABASE_AUTH_ENABLED || ALLOW_LOCAL_ADMIN);
}

function parseCookies(request) {
  return String(request.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf("=");
      if (separator === -1) return cookies;
      cookies[part.slice(0, separator)] = decodeURIComponent(part.slice(separator + 1));
      return cookies;
    }, {});
}

function isBasicAuthorized(request) {
  if (!localAdminEnabled()) return false;
  const header = request.headers.authorization || "";
  if (!header.startsWith("Basic ")) return false;

  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator === -1) return false;
    const user = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    return timingSafeEqual(user, ADMIN_USER) && timingSafeEqual(password, ADMIN_PASSWORD);
  } catch {
    return false;
  }
}

function isCookieAuthorized(request) {
  return Boolean(getSession(request));
}

function getSession(request) {
  const cookie = parseCookies(request)[SESSION_COOKIE];
  if (!cookie) return null;
  const separator = cookie.indexOf(".");
  if (separator === -1) return null;
  const payload = cookie.slice(0, separator);
  const signature = cookie.slice(separator + 1);
  if (timingSafeEqual(signature, signSession(payload))) {
    try {
      const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      const identity = String(session.identity || "");
      if (!Number.isFinite(session.expiresAt) || Date.now() >= session.expiresAt) return null;
      const allowedIdentity = identity === ADMIN_USER || (ADMIN_EMAILS.length > 0 && ADMIN_EMAILS.includes(identity.toLowerCase()));
      if (identity === ADMIN_USER && !localAdminEnabled()) return null;
      return allowedIdentity ? session : null;
    } catch {
      return null;
    }
  }
  return null;
}

function isAuthorized(request) {
  return isCookieAuthorized(request) || isBasicAuthorized(request);
}

function redirectToLogin(response) {
  response.writeHead(302, {
    ...commonHeaders({
      Location: "/login",
      "Cache-Control": "no-store"
    })
  });
  response.end();
}

function sendUnauthorizedJson(response) {
  sendJson(response, 401, { error: "Authentication required" });
}

function sendLoginPage(response, errorMessage = "") {
  response.writeHead(200, {
    ...commonHeaders({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    })
  });
  response.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HCC Admin Login</title>
  <style>
    :root { --red:#c8101e; --green:#0b5a38; --ink:#151a16; --paper:#fbf7ea; --line:rgba(12,83,51,.16); }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; display:grid; place-items:center; font-family:Arial,sans-serif; color:var(--ink); background:linear-gradient(135deg,#fffaf0,#eef6ea); padding:24px; }
    main { width:min(420px,100%); background:#fff; border:1px solid var(--line); border-radius:10px; padding:28px; box-shadow:0 20px 70px rgba(18,23,19,.14); }
    img { width:64px; height:64px; object-fit:contain; margin-bottom:16px; }
    h1 { margin:0 0 8px; font-size:1.7rem; }
    p { color:#607066; line-height:1.5; }
    label { display:grid; gap:7px; margin-top:16px; color:#607066; font-size:.78rem; font-weight:700; letter-spacing:1px; text-transform:uppercase; }
    input { width:100%; border:1px solid var(--line); border-radius:8px; padding:13px; font:inherit; }
    button { width:100%; min-height:46px; margin-top:20px; border:0; border-radius:8px; color:#fff; background:var(--red); font-weight:800; letter-spacing:1px; text-transform:uppercase; cursor:pointer; }
    .error { margin-top:14px; padding:11px 12px; border-radius:8px; color:#8e0712; background:rgba(200,16,30,.08); }
    .link-row { display:flex; justify-content:space-between; gap:14px; flex-wrap:wrap; margin-top:18px; }
    a { color:var(--green); font-weight:700; }
  </style>
</head>
<body>
  <main>
    <img src="/logo.webp" alt="HCC logo">
    <h1>Admin Login</h1>
    <p>Sign in to manage tournaments, images, socials, and testimonials.</p>
    <form method="POST" action="/login">
      <label>${SUPABASE_AUTH_ENABLED ? "Email" : "Username"}<input name="username" autocomplete="username" required></label>
      <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
      <button type="submit">Sign in</button>
    </form>
    ${errorMessage ? `<div class="error">${errorMessage}</div>` : ""}
    <div class="link-row">
      <a href="/">View website</a>
      <a href="/reset-request">Forgot password?</a>
    </div>
  </main>
</body>
</html>`);
}

function hasSupabaseAuthConfig() {
  return SUPABASE_AUTH_ENABLED && SUPABASE_URL && SUPABASE_ANON_KEY;
}

async function verifySupabaseLogin(username, password) {
  if (!hasSupabaseAuthConfig()) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email: username, password })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.user || !payload.user.email) return null;

  const email = String(payload.user.email).toLowerCase();
  if (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(email)) return null;
  return {
    identity: email,
    provider: "supabase",
    accessToken: payload.access_token || ""
  };
}

async function handleLogin(request, response) {
  const body = await readBody(request);
  const params = new URLSearchParams(body);
  const username = params.get("username") || "";
  const password = params.get("password") || "";

  const supabaseIdentity = await verifySupabaseLogin(username, password);
  const fallbackIdentity = localAdminEnabled() && timingSafeEqual(username, ADMIN_USER) && timingSafeEqual(password, ADMIN_PASSWORD)
    ? { identity: ADMIN_USER, provider: "local" }
    : null;
  const session = supabaseIdentity
    ? { identity: supabaseIdentity.identity, provider: supabaseIdentity.provider }
    : fallbackIdentity;

  if (session) {
    const value = makeSessionObjectValue(session);
    response.writeHead(302, {
      ...commonHeaders({
        Location: "/admin",
        "Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(value)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${IS_PRODUCTION ? "; Secure" : ""}`,
        "Cache-Control": "no-store"
      })
    });
    response.end();
    return;
  }

  sendLoginPage(response, "Invalid username or password.");
}

function handleLogout(response) {
  response.writeHead(302, {
    ...commonHeaders({
      Location: "/login",
      "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
      "Cache-Control": "no-store"
    })
  });
  response.end();
}

function requiresAdminAuth(request) {
  const parsed = new URL(request.url, `http://localhost:${PORT}`);
  const pathname = parsed.pathname;

  if (pathname === "/api/content" && request.method !== "GET") return true;
  if (pathname === "/api/upload") return true;
  if (pathname === "/api/cloudinary/delete") return true;
  if (pathname === "/api/session") return true;
  if (pathname === "/api/audit") return true;
  if (pathname === "/api/bookings" || pathname.startsWith("/api/bookings/")) return true;
  if (pathname === "/api/password-reset") return true;
  if (pathname === "/api/password-update") return true;
  return pathname === "/admin" ||
    pathname === "/index.html" ||
    pathname === "/admin.css" ||
    pathname === "/admin.js";
}

function isSameOriginWrite(request) {
  if (!new Set(["POST", "PUT", "PATCH", "DELETE"]).has(request.method)) return true;
  if (String(request.headers["sec-fetch-site"] || "").toLowerCase() === "cross-site") return false;

  const suppliedOrigin = request.headers.origin || request.headers.referer;
  if (!suppliedOrigin) return true;
  try {
    return new URL(suppliedOrigin).origin === getTrustedOrigin(request);
  } catch {
    return false;
  }
}

function readBody(request, maxBytes = MAX_JSON_BYTES) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        const error = new Error("Request body too large");
        error.statusCode = 413;
        reject(error);
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function sendResetRequestPage(response, message = "", isError = false) {
  response.writeHead(200, {
    ...commonHeaders({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    })
  });
  response.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset HCC Admin Login</title>
  <style>
    :root { --red:#c8101e; --green:#0b5a38; --ink:#151a16; --line:rgba(12,83,51,.16); }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; display:grid; place-items:center; font-family:Arial,sans-serif; color:var(--ink); background:linear-gradient(135deg,#fffaf0,#eef6ea); padding:24px; }
    main { width:min(420px,100%); background:#fff; border:1px solid var(--line); border-radius:10px; padding:28px; box-shadow:0 20px 70px rgba(18,23,19,.14); }
    img { width:64px; height:64px; object-fit:contain; margin-bottom:16px; }
    h1 { margin:0 0 8px; font-size:1.7rem; }
    p { color:#607066; line-height:1.5; }
    label { display:grid; gap:7px; margin-top:16px; color:#607066; font-size:.78rem; font-weight:700; letter-spacing:1px; text-transform:uppercase; }
    input { width:100%; border:1px solid var(--line); border-radius:8px; padding:13px; font:inherit; }
    button { width:100%; min-height:46px; margin-top:20px; border:0; border-radius:8px; color:#fff; background:var(--red); font-weight:800; letter-spacing:1px; text-transform:uppercase; cursor:pointer; }
    .message { margin-top:14px; padding:11px 12px; border-radius:8px; color:${isError ? "#8e0712" : "var(--green)"}; background:${isError ? "rgba(200,16,30,.08)" : "rgba(11,90,56,.08)"}; }
    a { display:inline-block; margin-top:18px; color:var(--green); font-weight:700; }
  </style>
</head>
<body>
  <main>
    <img src="/logo.webp" alt="HCC logo">
    <h1>Reset login</h1>
    <p>Enter the admin email. If it is allowed, Supabase will send a secure password reset link.</p>
    <form method="POST" action="/reset-request">
      <label>Email<input name="email" type="email" autocomplete="email" required></label>
      <button type="submit">Send reset email</button>
    </form>
    ${message ? `<div class="message">${message}</div>` : ""}
    <a href="/login">Back to login</a>
  </main>
</body>
</html>`);
}

async function sendSupabasePasswordReset(email, request) {
  if (!hasSupabaseAuthConfig()) {
    throw new Error("Supabase Auth is not configured.");
  }
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) throw new Error("Email is required.");
  if (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(cleanEmail)) {
    return { ok: true };
  }

  const redirectTo = `${getTrustedOrigin(request)}/reset-password`;
  const resetResponse = await fetch(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email: cleanEmail })
  });
  const payload = await resetResponse.json().catch(() => ({}));
  if (!resetResponse.ok) {
    throw new Error(payload.error_description || payload.msg || payload.message || "Password reset failed.");
  }
  return { ok: true };
}

async function updateSupabasePasswordWithLogin(identity, currentPassword, newPassword) {
  if (!hasSupabaseAuthConfig()) throw new Error("Supabase Auth is not configured.");
  if (!identity || !currentPassword || !newPassword) throw new Error("Current and new passwords are required.");
  if (String(newPassword).length < 8) throw new Error("New password must be at least 8 characters.");

  const login = await verifySupabaseLogin(identity, currentPassword);
  if (!login || !login.accessToken) throw new Error("Current password is incorrect.");
  return updateSupabasePasswordWithToken(login.accessToken, newPassword);
}

async function updateSupabasePasswordWithToken(accessToken, newPassword) {
  if (!hasSupabaseAuthConfig()) throw new Error("Supabase Auth is not configured.");
  if (!accessToken || !newPassword) throw new Error("Access token and new password are required.");
  if (String(newPassword).length < 8) throw new Error("New password must be at least 8 characters.");

  const updateResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ password: newPassword })
  });
  const payload = await updateResponse.json().catch(() => ({}));
  if (!updateResponse.ok) {
    throw new Error(payload.error_description || payload.msg || payload.message || "Password update failed.");
  }
  return { ok: true };
}

function sendResetPasswordPage(response) {
  response.writeHead(200, {
    ...commonHeaders({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    })
  });
  response.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset HCC Admin Password</title>
  <style>
    :root { --red:#c8101e; --green:#0b5a38; --ink:#151a16; --paper:#fbf7ea; --line:rgba(12,83,51,.16); }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; display:grid; place-items:center; font-family:Arial,sans-serif; color:var(--ink); background:linear-gradient(135deg,#fffaf0,#eef6ea); padding:24px; }
    main { width:min(440px,100%); background:#fff; border:1px solid var(--line); border-radius:10px; padding:28px; box-shadow:0 20px 70px rgba(18,23,19,.14); }
    img { width:64px; height:64px; object-fit:contain; margin-bottom:16px; }
    h1 { margin:0 0 8px; font-size:1.7rem; }
    p { color:#607066; line-height:1.5; }
    label { display:grid; gap:7px; margin-top:16px; color:#607066; font-size:.78rem; font-weight:700; letter-spacing:1px; text-transform:uppercase; }
    input { width:100%; border:1px solid var(--line); border-radius:8px; padding:13px; font:inherit; }
    button { width:100%; min-height:46px; margin-top:20px; border:0; border-radius:8px; color:#fff; background:var(--red); font-weight:800; letter-spacing:1px; text-transform:uppercase; cursor:pointer; }
    .message { margin-top:14px; padding:11px 12px; border-radius:8px; color:var(--green); background:rgba(11,90,56,.08); }
    .error { color:#8e0712; background:rgba(200,16,30,.08); }
    a { display:inline-block; margin-top:18px; color:var(--green); font-weight:700; }
  </style>
</head>
<body>
  <main>
    <img src="/logo.webp" alt="HCC logo">
    <h1>Reset password</h1>
    <p>Enter a new password for your HCC admin account.</p>
    <form id="resetForm">
      <label>New password<input id="password" type="password" autocomplete="new-password" minlength="8" required></label>
      <button type="submit">Update password</button>
    </form>
    <div class="message" id="message" hidden></div>
    <a href="/login">Back to login</a>
  </main>
  <script>
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get("access_token");
    const message = document.getElementById("message");
    if (!token) {
      message.hidden = false;
      message.className = "message error";
      message.textContent = "This reset link is missing or expired. Request a new reset email.";
    }
    document.getElementById("resetForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      message.hidden = false;
      message.className = "message";
      message.textContent = "Updating password...";
      const response = await fetch("/api/password-update-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: token, newPassword: document.getElementById("password").value })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        message.className = "message error";
        message.textContent = result.error || "Password update failed.";
        return;
      }
      history.replaceState(null, "", "/login");
      message.textContent = "Password updated. You can sign in now.";
    });
  </script>
</body>
</html>`);
}

function serveFile(requestUrl, response) {
  const parsed = new URL(requestUrl, `http://localhost:${PORT}`);
  let routePath = parsed.pathname;
  if (routePath === "/") routePath = "/site.html";
  if (routePath === "/admin") routePath = "/index.html";
  const pathname = decodeURIComponent(routePath);
  const safePath = publicFiles.get(pathname);
  if (!safePath) {
    response.writeHead(404, commonHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
    response.end("Not found");
    return;
  }
  if (!safePath.startsWith(`${ROOT}${path.sep}`)) {
    response.writeHead(400, commonHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
    response.end("Invalid path");
    return;
  }

  fs.readFile(safePath, (error, file) => {
    if (error) {
      response.writeHead(404, commonHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
      response.end("Not found");
      return;
    }

    const extname = path.extname(safePath).toLowerCase();

    response.writeHead(200, {
      ...commonHeaders({
        "Content-Type": mimeTypes[extname] || "application/octet-stream",
        "Cache-Control": getStaticCacheControl(extname)
      })
    });
    response.end(file);
  });
}

function sendRobots(request, response) {
  const origin = getTrustedOrigin(request);
  response.writeHead(200, commonHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
  response.end(`User-agent: *\nDisallow: /admin\nDisallow: /login\nSitemap: ${origin}/sitemap.xml\n`);
}

function sendSitemap(request, response) {
  const origin = getTrustedOrigin(request);
  response.writeHead(200, commonHeaders({ "Content-Type": "application/xml; charset=utf-8" }));
  response.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${origin}/</loc><priority>1.0</priority></url>\n  <url><loc>${origin}/privacy</loc><priority>0.3</priority></url>\n  <url><loc>${origin}/terms</loc><priority>0.3</priority></url>\n</urlset>\n`);
}

function getOrigin(request) {
  return getTrustedOrigin(request);
}

function getRequestOrigin(request) {
  const protocol = TRUST_PROXY && request.headers["x-forwarded-proto"]
    ? String(request.headers["x-forwarded-proto"]).split(",")[0].trim()
    : (request.socket.encrypted ? "https" : "http");
  const host = String(request.headers.host || `localhost:${PORT}`).split(",")[0].trim().toLowerCase();
  if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
    return `http://localhost:${PORT}`;
  }
  return `${protocol}://${host}`;
}

function authMode() {
  if (hasSupabaseAuthConfig()) return "supabase-auth";
  if (localAdminEnabled()) return "local-admin";
  return "misconfigured";
}

function sendLegalPage(response, type) {
  const isPrivacy = type === "privacy";
  const title = isPrivacy ? "Privacy Policy" : "Terms of Use";
  const sections = isPrivacy
    ? [
      {
        heading: "1. Who We Are",
        paragraphs: [
          "Hamriyah Cricket Centre (\"HCC\", \"we\", \"our\", or \"us\") respects your privacy and is committed to protecting the personal information you provide when you use our website, contact our team, submit booking or tournament enquiries, or otherwise interact with our services.",
          "Hamriyah Cricket Centre is a cricket facility and sports venue located in Hamriyah, Sharjah, United Arab Emirates. Our website is intended to provide information about our venue, facilities, tournaments, media, contact details, and booking or registration enquiries."
        ]
      },
      {
        heading: "2. Information We Collect",
        paragraphs: [
          "We may collect personal information that you voluntarily provide to us, including your full name, phone number, email address, team name or organization name, booking details, tournament registration details, preferred dates and times, messages, comments, notes, and any other information you choose to provide through forms or direct contact.",
          "We may also collect limited technical information automatically when you use the website, such as your IP address, browser type, device type, referring pages, access times, and basic website usage, security, and error log information."
        ]
      },
      {
        heading: "3. How We Collect Information",
        paragraphs: [
          "We collect information when you submit a booking enquiry, register interest in a tournament, contact us by form, email, or phone, when an administrator uploads or manages content through the admin system, and when your browser interacts with the website for technical, security, or performance purposes."
        ]
      },
      {
        heading: "4. Why We Use Your Information",
        paragraphs: [
          "We use your information to respond to booking, enquiry, or registration requests, communicate with you about venue availability, tournaments, schedules, and related services, manage and organize bookings or registrations, improve the content, security, and performance of the website, maintain internal administration records, prevent misuse, spam, fraud, and unauthorized access, and comply with legal or regulatory obligations where applicable.",
          "We do not sell your personal information to third parties."
        ]
      },
      {
        heading: "5. Website Forms and Communications",
        paragraphs: [
          "When you submit a form through our website, your information may be processed through our website server and forwarded to our configured form handling provider for delivery and response management.",
          "By submitting a form, you acknowledge that we may contact you by phone, email, or messaging applications in relation to your enquiry, booking, registration, or follow-up service communication."
        ]
      },
      {
        heading: "6. Media, Admin Content, and Storage Providers",
        paragraphs: [
          "Our website and admin system may use third-party services to store or process content, including Supabase for structured website content and admin-related data storage, Cloudinary for website image and media storage, hosting infrastructure providers for application delivery and uptime, and form processing providers for handling contact and booking submissions.",
          "These services may process information on our behalf as part of the technical operation of the website. We use reasonable efforts to work with service providers that are appropriate for normal commercial website operations."
        ]
      },
      {
        heading: "7. Cookies and Similar Technologies",
        paragraphs: [
          "Our website may use essential technical mechanisms, session tools, and similar technologies required for site functionality, admin access, security, and performance.",
          "We may also use limited technical data to understand whether pages are functioning correctly and to help protect the website from abuse, spam, malicious traffic, or unauthorized activity. If analytics, advertising, or additional tracking technologies are introduced in the future, this Privacy Policy may be updated accordingly."
        ]
      },
      {
        heading: "8. Legal Basis and Compliance",
        paragraphs: [
          "We aim to handle personal information responsibly and in accordance with applicable laws and regulations, including relevant data protection and privacy rules that may apply in the United Arab Emirates and, where relevant, to users accessing the site from other jurisdictions.",
          "By using this website or submitting your information, you understand that your data may be processed for legitimate business purposes related to enquiries, bookings, tournament coordination, customer communication, security, and website management."
        ]
      },
      {
        heading: "9. How Long We Keep Information",
        paragraphs: [
          "We retain personal information only for as long as reasonably necessary for responding to your enquiry, managing a booking or registration, maintaining internal business records, resolving disputes, enforcing our policies, and meeting legal, accounting, or administrative obligations."
        ]
      },
      {
        heading: "10. Data Sharing",
        paragraphs: [
          "We may share information only where reasonably necessary, including with service providers supporting website hosting, media storage, content systems, or form handling, with internal staff or authorized administrators who need the information to respond to you or manage operations, where disclosure is required by law, legal process, or regulatory request, or where necessary to protect our rights, property, users, systems, or business operations.",
          "We do not sell or rent personal information as a standalone business activity."
        ]
      },
      {
        heading: "11. International Data Processing",
        paragraphs: [
          "Some of the third-party tools used by the website may store or process data on servers located outside the United Arab Emirates. By using the site and submitting your information, you understand that such transfers may occur as part of normal website operations.",
          "We take reasonable steps to use reputable providers, but cross-border processing may still be involved in hosting, storage, delivery, security, or communications."
        ]
      },
      {
        heading: "12. Data Security",
        paragraphs: [
          "We take reasonable technical and organizational measures to protect personal information from unauthorized access, misuse, loss, alteration, or disclosure. However, no website, server, or method of electronic transmission is completely secure, and we cannot guarantee absolute security."
        ]
      },
      {
        heading: "13. Your Rights",
        paragraphs: [
          "Subject to applicable law, you may have the right to request access to personal information we hold about you, correction of inaccurate information, deletion of certain personal information, withdrawal from future non-essential communications, or clarification on how your information is used.",
          "To make a privacy-related request, please contact us using the details below. We may need to verify your identity before fulfilling certain requests."
        ]
      },
      {
        heading: "14. Children's Privacy",
        paragraphs: [
          "This website is not intentionally directed at young children for independent submission of personal information. If a parent or guardian believes that a child has submitted personal information to us inappropriately, they may contact us and request its review or deletion where appropriate."
        ]
      },
      {
        heading: "15. Third-Party Links",
        paragraphs: [
          "Our website may contain links to third-party websites, maps, social media pages, tournament platforms, or external services. We are not responsible for the privacy practices, content, or policies of external websites or services not controlled by us."
        ]
      },
      {
        heading: "16. Policy Updates",
        paragraphs: [
          "We may update this Privacy Policy from time to time to reflect changes in our operations, technology, service providers, legal requirements, or website features. The updated version will be posted on this page with a revised effective date."
        ]
      },
      {
        heading: "17. Contact Us",
        paragraphs: [
          "If you have any questions about this Privacy Policy or how your information is handled, please contact us.",
          "Hamriyah Cricket Centre",
          "Hamriyah West, Sharjah, United Arab Emirates",
          "Email: info@hamriyahcricketcentre.ae",
          "Phone: 056 225 5337"
        ]
      }
    ]
    : [
      {
        heading: "1. About This Website",
        paragraphs: [
          "Welcome to the Hamriyah Cricket Centre website. These Terms of Use govern your access to and use of our website, pages, content, forms, and related online services.",
          "This website is operated by Hamriyah Cricket Centre (\"HCC\", \"we\", \"our\", or \"us\"), located in Hamriyah, Sharjah, United Arab Emirates. The website is provided for general informational, promotional, enquiry, communication, and administrative purposes related to our cricket facilities, bookings, tournaments, media, and business operations."
        ]
      },
      {
        heading: "2. Acceptance of Terms",
        paragraphs: [
          "By visiting, browsing, or interacting with this website, you confirm that you accept these Terms of Use and agree to comply with them. If you are using this website on behalf of a team, company, academy, group, or other organization, you represent that you are authorized to act on its behalf."
        ]
      },
      {
        heading: "3. Eligibility and Proper Use",
        paragraphs: [
          "You agree to use the website only for lawful purposes and in a way that does not violate any applicable law or regulation, infringe the rights of others, interfere with the normal operation of the website, attempt unauthorized access to the admin area, introduce malicious code or harmful material, submit false, misleading, abusive, or fraudulent information, or misuse forms, bookings, registrations, or contact channels."
        ]
      },
      {
        heading: "4. Informational Nature of Website Content",
        paragraphs: [
          "All content on this website is provided for general information only. While we aim to keep the content accurate and up to date, we do not guarantee that all information is complete, current, error-free, or always available.",
          "This includes tournament details, schedules, fixtures, availability, venue descriptions, facility information, contact details, images, promotional content, and booking-related information. Final booking terms, venue availability, event details, and operational decisions may need to be confirmed directly with Hamriyah Cricket Centre."
        ]
      },
      {
        heading: "5. No Guaranteed Booking or Registration",
        paragraphs: [
          "Submitting a form, enquiry, or tournament interest through the website does not automatically create a confirmed booking, reservation, or participation right. A booking, reservation, or registration is only final when confirmed directly by Hamriyah Cricket Centre through its official communication process.",
          "We reserve the right to accept, reject, reschedule, cancel, or modify enquiries, bookings, or registrations at our discretion and subject to operational requirements."
        ]
      },
      {
        heading: "6. Tournament and Event Information",
        paragraphs: [
          "Tournament listings, prize details, dates, rules, participation conditions, and related content may be added, edited, postponed, or removed without prior notice. Users remain responsible for confirming current details with us before relying on them for travel, payment, team commitments, or scheduling."
        ]
      },
      {
        heading: "7. Intellectual Property",
        paragraphs: [
          "Unless otherwise stated, the website and its contents, including text, design, layout, branding, logos, graphics, photographs, video, media, source presentation, and original written content, are owned by or licensed to Hamriyah Cricket Centre.",
          "You may view the site for personal and lawful business enquiry purposes only. You may not, without prior written permission, reproduce, republish, distribute, modify, commercially exploit, mirror, scrape, or copy substantial portions of the site except where permitted by law."
        ]
      },
      {
        heading: "8. User Submissions",
        paragraphs: [
          "When you submit information to us through a form or communication channel, you confirm that the information is accurate to the best of your knowledge, that you have the right to provide it, and that it does not violate any law or third-party right.",
          "We may remove, ignore, refuse, or not respond to submissions that appear inappropriate, incomplete, suspicious, or operationally unsuitable."
        ]
      },
      {
        heading: "9. Admin and Restricted Access",
        paragraphs: [
          "Certain parts of the website, including the admin panel and administrative functions, are restricted to authorized personnel only. You must not attempt to access, probe, bypass, disrupt, reverse engineer, or interfere with any restricted area, login system, security measure, or backend function of the website."
        ]
      },
      {
        heading: "10. Third-Party Services and Links",
        paragraphs: [
          "This website may integrate with or link to third-party tools, platforms, maps, social media pages, media services, communication services, or data infrastructure providers. We do not control third-party websites or services and are not responsible for their availability, policies, security, content, or performance."
        ]
      },
      {
        heading: "11. Disclaimer of Warranties",
        paragraphs: [
          "To the maximum extent permitted by applicable law, the website is provided on an \"as is\" and \"as available\" basis. We do not make warranties or representations, express or implied, regarding site availability, uninterrupted or error-free operation, completeness or accuracy of content, suitability for a particular purpose, or absence of bugs, security incidents, or technical issues."
        ]
      },
      {
        heading: "12. Limitation of Liability",
        paragraphs: [
          "To the fullest extent permitted by law, Hamriyah Cricket Centre shall not be liable for any direct, indirect, incidental, consequential, special, or business-related loss arising out of or connected with use of or inability to use the website, reliance on website content, booking misunderstandings not yet confirmed by us, tournament changes or cancellations, technical errors, outages, delays, interruptions, unauthorized access by third parties, or external websites and third-party services."
        ]
      },
      {
        heading: "13. Indemnity",
        paragraphs: [
          "You agree to indemnify and hold harmless Hamriyah Cricket Centre, its owners, staff, operators, administrators, and service providers from claims, liabilities, losses, damages, and expenses arising from your misuse of the website, your breach of these Terms, your unlawful conduct, your infringement of third-party rights, or false or misleading submissions made by you."
        ]
      },
      {
        heading: "14. Privacy",
        paragraphs: [
          "Your use of the website is also subject to our Privacy Policy, which explains how we collect and use personal information."
        ]
      },
      {
        heading: "15. Suspension or Termination",
        paragraphs: [
          "We may restrict, suspend, block, or terminate access to all or part of the website at any time, with or without notice, particularly where we believe there is misuse, technical risk, unauthorized activity, or security concern."
        ]
      },
      {
        heading: "16. Changes to These Terms",
        paragraphs: [
          "We may update these Terms of Use from time to time. The latest version will be posted on this page with the effective date. Your continued use of the website after updated Terms are posted constitutes acceptance of those revised Terms."
        ]
      },
      {
        heading: "17. Governing Law",
        paragraphs: [
          "These Terms of Use shall be governed by and interpreted in accordance with the laws applicable in the United Arab Emirates, without prejudice to any mandatory consumer or legal protections that may apply under relevant law."
        ]
      },
      {
        heading: "18. Contact Information",
        paragraphs: [
          "For questions about these Terms of Use, please contact us.",
          "Hamriyah Cricket Centre",
          "Hamriyah West, Sharjah, United Arab Emirates",
          "Email: info@hamriyahcricketcentre.ae",
          "Phone: 056 225 5337"
        ]
      }
    ];
  response.writeHead(200, commonHeaders({ "Content-Type": "text/html; charset=utf-8" }));
  response.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | Hamriyah Cricket Centre</title>
  <meta name="robots" content="index,follow">
  <style>
    body { margin:0; font-family:Arial,sans-serif; color:#151a16; background:#fffaf0; line-height:1.7; }
    main { width:min(820px, calc(100% - 32px)); margin:0 auto; padding:72px 0; }
    a { color:#0b5a38; font-weight:700; }
    h1 { margin:0 0 18px; font-size:clamp(2rem,6vw,4rem); line-height:1; color:#c8101e; }
    h2 { margin:28px 0 10px; font-size:1.2rem; color:#0c5333; }
    p { color:#3f4a43; font-size:1rem; margin:0 0 14px; }
    .card { background:#fff; border:1px solid rgba(12,83,51,.16); border-radius:8px; padding:28px; box-shadow:0 18px 54px rgba(6,53,31,.09); }
    .eyebrow { display:inline-block; margin-bottom:12px; font-size:.8rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#0c5333; }
    .updated { margin-top:24px; padding-top:18px; border-top:1px solid rgba(12,83,51,.12); color:#69746d; }
  </style>
</head>
<body>
  <main>
    <p><a href="/">Back to website</a></p>
    <div class="card">
      <span class="eyebrow">Hamriyah Cricket Centre</span>
      <h1>${title}</h1>
      <p>Effective Date: 13 July 2026</p>
      ${sections.map((section) => `
        <section>
          <h2>${section.heading}</h2>
          ${section.paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("")}
        </section>
      `).join("")}
      <p class="updated">Last updated: 13 July 2026</p>
    </div>
  </main>
</body>
</html>`);
}

const server = http.createServer(async (request, response) => {
  try {
    const parsed = new URL(request.url, `http://localhost:${PORT}`);

    if (!checkRateLimit(request, "global", 600, 60 * 1000)) {
      sendJson(response, 429, { error: "Too many requests" });
      return;
    }

    if (!isSameOriginWrite(request)) {
      sendJson(response, 403, { error: "Cross-site request blocked" });
      return;
    }

    if (parsed.pathname === "/health") {
      sendJson(response, 200, {
        ok: true,
        contentStorage: hasSupabaseConfig() ? "supabase" : "local-json",
        bookingStorage: hasSupabaseConfig() ? "supabase" : "local-json",
        bookingRetentionDays: BOOKING_RETENTION_DAYS,
        imageStorage: hasCloudinaryConfig() ? "cloudinary" : "local-data",
        auth: authMode(),
        localAdmin: localAdminEnabled() ? "enabled" : "disabled",
        forms: FORMSPREE_ENDPOINT ? "configured" : "missing"
      });
      return;
    }

    if (parsed.pathname === "/robots.txt") {
      sendRobots(request, response);
      return;
    }

    if (parsed.pathname === "/sitemap.xml") {
      sendSitemap(request, response);
      return;
    }

    if (parsed.pathname === "/privacy") {
      sendLegalPage(response, "privacy");
      return;
    }

    if (parsed.pathname === "/terms") {
      sendLegalPage(response, "terms");
      return;
    }

    if (parsed.pathname === "/login" && request.method === "GET") {
      sendLoginPage(response);
      return;
    }

    if (parsed.pathname === "/login" && request.method === "POST") {
      if (!checkRateLimit(request, "login", 8, 15 * 60 * 1000)) {
        sendLoginPage(response, "Too many login attempts. Please try again later.");
        return;
      }
      await handleLogin(request, response);
      return;
    }

    if (parsed.pathname === "/reset-request" && request.method === "GET") {
      sendResetRequestPage(response);
      return;
    }

    if (parsed.pathname === "/reset-request" && request.method === "POST") {
      if (!checkRateLimit(request, "password-reset", 5, 60 * 60 * 1000)) {
        sendResetRequestPage(response, "Too many reset requests. Please try again later.", true);
        return;
      }
      const params = new URLSearchParams(await readBody(request));
      try {
        await sendSupabasePasswordReset(params.get("email"), request);
        sendResetRequestPage(response, "If that email is allowed, a reset link has been sent.");
      } catch (error) {
        sendResetRequestPage(response, error.message || "Password reset failed.", true);
      }
      return;
    }

    if (parsed.pathname === "/reset-password" && request.method === "GET") {
      sendResetPasswordPage(response);
      return;
    }

    if (parsed.pathname === "/logout") {
      handleLogout(response);
      return;
    }

    if (requiresAdminAuth(request) && !isAuthorized(request)) {
      if (parsed.pathname.startsWith("/api/")) sendUnauthorizedJson(response);
      else redirectToLogin(response);
      return;
    }

    if (request.url === "/api/content" && request.method === "GET") {
      sendJson(response, 200, await readContent(), {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300"
      });
      return;
    }

    if (request.url === "/api/session" && request.method === "GET") {
      const session = getSession(request);
      sendJson(response, 200, {
        identity: session?.identity || ADMIN_USER,
        provider: session?.provider || "basic",
        contentStorage: hasSupabaseConfig() ? "supabase" : "local-json",
        bookingStorage: hasSupabaseConfig() ? "supabase" : "local-json",
        bookingRetentionDays: BOOKING_RETENTION_DAYS,
        imageStorage: hasCloudinaryConfig() ? "cloudinary" : "local-data",
        auth: authMode(),
        forms: FORMSPREE_ENDPOINT ? "configured" : "missing"
      });
      return;
    }

    if (request.url === "/api/audit" && request.method === "GET") {
      sendJson(response, 200, { entries: await readAuditLog() });
      return;
    }

    if (request.url === "/api/audit" && request.method === "DELETE") {
      clearAuditLog();
      await logAudit(request, "audit.clear");
      sendJson(response, 200, { ok: true });
      return;
    }

    if (parsed.pathname === "/api/bookings" && request.method === "GET") {
      sendJson(response, 200, { bookings: await readBookings() });
      return;
    }

    if (parsed.pathname === "/api/booking-status" && request.method === "POST") {
      if (!checkRateLimit(request, "booking-status", 12, 15 * 60 * 1000)) {
        sendJson(response, 429, { error: "Too many status checks. Please try again later." });
        return;
      }
      const payload = JSON.parse(await readBody(request, 8 * 1024));
      const reference = String(payload.reference || "").trim().toUpperCase();
      const email = String(payload.email || "").trim().toLowerCase();
      if (!/^HCC-\d{8}-[A-Z0-9]{6,12}$/.test(reference) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        throw new ValidationError("Enter a valid booking reference and email address.");
      }
      const booking = await findBookingForCustomer(reference, email);
      if (!booking) {
        sendJson(response, 404, { error: "No matching booking was found." });
        return;
      }
      sendJson(response, 200, booking);
      return;
    }

    if (parsed.pathname.startsWith("/api/bookings/") && request.method === "PATCH") {
      if (!checkRateLimit(request, "booking-update", 120, 60 * 1000)) {
        sendJson(response, 429, { error: "Too many booking updates" });
        return;
      }
      const reference = decodeURIComponent(parsed.pathname.slice("/api/bookings/".length));
      if (!/^HCC-\d{8}-[A-Z0-9]{6,12}$/.test(reference)) {
        sendJson(response, 400, { error: "Invalid booking reference" });
        return;
      }
      const changes = JSON.parse(await readBody(request));
      const booking = await updateBooking(reference, changes);
      await logAudit(request, "booking.update", { reference, status: booking.status });
      sendJson(response, 200, booking);
      return;
    }

    if (parsed.pathname.startsWith("/api/bookings/") && request.method === "DELETE") {
      if (!checkRateLimit(request, "booking-delete", 30, 60 * 1000)) {
        sendJson(response, 429, { error: "Too many booking deletions" });
        return;
      }
      const reference = decodeURIComponent(parsed.pathname.slice("/api/bookings/".length));
      if (!/^HCC-\d{8}-[A-Z0-9]{6,12}$/.test(reference)) {
        sendJson(response, 400, { error: "Invalid booking reference" });
        return;
      }
      await deleteBooking(reference);
      await logAudit(request, "booking.delete", { reference });
      sendJson(response, 200, { ok: true, reference });
      return;
    }

    if (request.url === "/api/content" && request.method === "POST") {
      if (!checkRateLimit(request, "content-write", 80, 60 * 1000)) {
        sendJson(response, 429, { error: "Too many save requests" });
        return;
      }
      const payload = JSON.parse(await readBody(request));
      const saved = await writeContent(payload);
      await logAudit(request, "content.save", {
        tournaments: saved.tournaments.length,
        images: saved.images.length,
        socials: saved.socials.length,
        testimonials: saved.testimonials.length
      });
      sendJson(response, 200, saved);
      return;
    }

    if (request.url === "/api/upload" && request.method === "POST") {
      if (!checkRateLimit(request, "upload", 30, 60 * 1000)) {
        sendJson(response, 429, { error: "Too many upload requests" });
        return;
      }
      const payload = JSON.parse(await readBody(request));
      const uploaded = await uploadImageToCloudinary(payload);
      await logAudit(request, "image.upload", {
        provider: uploaded.provider,
        context: payload.context || "uploads",
        publicId: uploaded.publicId || ""
      });
      sendJson(response, 200, uploaded);
      return;
    }

    if (request.url === "/api/cloudinary/delete" && request.method === "POST") {
      if (!checkRateLimit(request, "cloudinary-delete", 40, 60 * 1000)) {
        sendJson(response, 429, { error: "Too many delete requests" });
        return;
      }
      const payload = JSON.parse(await readBody(request));
      const deleted = await deleteCloudinaryImage(payload.publicId);
      await logAudit(request, "image.delete", { publicId: payload.publicId || "", result: deleted.result || "skipped" });
      sendJson(response, 200, deleted);
      return;
    }

    if (request.url === "/api/password-reset" && request.method === "POST") {
      if (!checkRateLimit(request, "password-reset-admin", 5, 60 * 60 * 1000)) {
        sendJson(response, 429, { error: "Too many reset requests" });
        return;
      }
      const payload = JSON.parse(await readBody(request));
      const reset = await sendSupabasePasswordReset(payload.email, request);
      await logAudit(request, "password.reset.request", { email: String(payload.email || "").trim().toLowerCase() });
      sendJson(response, 200, reset);
      return;
    }

    if (request.url === "/api/password-update" && request.method === "POST") {
      if (!checkRateLimit(request, "password-update", 8, 15 * 60 * 1000)) {
        sendJson(response, 429, { error: "Too many password update requests" });
        return;
      }
      const session = getSession(request);
      if (!session || session.provider !== "supabase") {
        sendJson(response, 400, { error: "Password changes are available for Supabase admin accounts. Configure ADMIN_PASSWORD only if you intentionally enable local admin." });
        return;
      }
      const payload = JSON.parse(await readBody(request));
      const updated = await updateSupabasePasswordWithLogin(session.identity, payload.currentPassword, payload.newPassword);
      await logAudit(request, "password.update", { identity: session.identity });
      sendJson(response, 200, updated);
      return;
    }

    if (request.url === "/api/password-update-token" && request.method === "POST") {
      if (!checkRateLimit(request, "password-update-token", 8, 15 * 60 * 1000)) {
        sendJson(response, 429, { error: "Too many password update requests" });
        return;
      }
      const payload = JSON.parse(await readBody(request));
      sendJson(response, 200, await updateSupabasePasswordWithToken(payload.accessToken, payload.newPassword));
      return;
    }

    if (request.url === "/api/form-submit" && request.method === "POST") {
      if (!checkRateLimit(request, "form-submit", 20, 60 * 1000)) {
        sendJson(response, 429, { error: "Too many form submissions" });
        return;
      }
      const payload = JSON.parse(await readBody(request, 32 * 1024));
      const result = await forwardFormSubmission(payload);
      sendJson(response, result.deliveryStatus === "failed" ? 202 : 200, result);
      return;
    }

    serveFile(request.url, response);
  } catch (error) {
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    if (status >= 500) console.error(error);
    const message = status >= 500 && IS_PRODUCTION ? "The service is temporarily unavailable." : (error.message || "Server error");
    sendJson(response, status, { error: message });
  }
});

validateStartupConfig();
ensureContentFile();
server.listen(PORT, () => {
  console.log(`HCC website running at http://localhost:${PORT}/`);
  console.log(`Admin panel available at http://localhost:${PORT}/admin`);
  console.log(`Content storage: ${hasSupabaseConfig() ? "Supabase" : "local JSON fallback"}`);
  console.log(`Image storage: ${hasCloudinaryConfig() ? "Cloudinary" : "local data fallback"}`);
  console.log(`Forms: ${FORMSPREE_ENDPOINT ? "Formspree proxy" : "not configured"}`);
  console.log(`Local admin fallback: ${localAdminEnabled() ? "enabled" : "disabled"}`);
});
