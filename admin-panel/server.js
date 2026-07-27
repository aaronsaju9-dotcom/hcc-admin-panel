const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const net = require("net");

const PORT = Number(process.env.PORT || 8765);
const IS_VERCEL = process.env.VERCEL === "1" || process.env.VERCEL === "true";
const IS_VERCEL_PREVIEW = process.env.VERCEL_ENV === "preview";
const ROOT = path.resolve(__dirname);
const DATA_DIR = process.env.HCC_DATA_DIR
  ? path.resolve(process.env.HCC_DATA_DIR)
  : (IS_VERCEL ? path.join("/tmp", "hcc-data") : path.join(ROOT, "data"));
const CONTENT_FILE = path.join(DATA_DIR, "content.json");
const AUDIT_FILE = path.join(DATA_DIR, "audit.json");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");
const IS_PRODUCTION = process.env.NODE_ENV === "production" && !IS_VERCEL_PREVIEW;
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SESSION_SECRET = process.env.SESSION_SECRET || (IS_PRODUCTION ? "" : crypto.randomBytes(32).toString("hex"));
const SESSION_COOKIE = "hcc_admin_session";
const MFA_PENDING_COOKIE = "hcc_mfa_pending";
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_CONTENT_TABLE = process.env.SUPABASE_CONTENT_TABLE || "hcc_site_content";
const SUPABASE_AUDIT_TABLE = process.env.SUPABASE_AUDIT_TABLE || "hcc_admin_audit";
const SUPABASE_BOOKINGS_TABLE = process.env.SUPABASE_BOOKINGS_TABLE || "hcc_bookings";
const CONTENT_RECORD_ID = process.env.CONTENT_RECORD_ID || "main";
const SUPABASE_AUTH_ENABLED = process.env.SUPABASE_AUTH_ENABLED === "true";
const SUPABASE_MFA_REQUIRED = process.env.SUPABASE_MFA_REQUIRED !== "false";
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
const BOOKING_RETENTION_DAYS_VALUE = Number(process.env.BOOKING_RETENTION_DAYS || 180);
const BOOKING_RETENTION_DAYS = Number.isFinite(BOOKING_RETENTION_DAYS_VALUE) ? Math.floor(Math.max(0, BOOKING_RETENTION_DAYS_VALUE)) : 0;
const BOOKING_PURGE_INTERVAL_HOURS_VALUE = Number(process.env.BOOKING_PURGE_INTERVAL_HOURS || 6);
const BOOKING_PURGE_INTERVAL_MS = Math.max(1, Number.isFinite(BOOKING_PURGE_INTERVAL_HOURS_VALUE) ? BOOKING_PURGE_INTERVAL_HOURS_VALUE : 6) * 60 * 60 * 1000;
const TRUST_PROXY = process.env.TRUST_PROXY === "true";
const PUBLIC_ORIGIN = parseOrigin(process.env.PUBLIC_ORIGIN || "");
const SESSION_TTL_MS = Math.max(0.25, Number(process.env.ADMIN_SESSION_HOURS || 1)) * 60 * 60 * 1000;
const MFA_PENDING_TTL_MS = 10 * 60 * 1000;
const MAX_FORM_BYTES = 8 * 1024;
const MAX_JSON_BYTES = 64 * 1024;
const MAX_CONTENT_BYTES = 1024 * 1024;
const MAX_UPLOAD_BODY_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_CONCURRENT_BODY_READS = 100;
const PROVIDER_TIMEOUT_MS = 10 * 1000;
const rateLimits = new Map();
const revokedSessionIds = new Map();
let activeBodyReads = 0;

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
  if (IS_PRODUCTION && BOOKING_RETENTION_DAYS < 1) {
    issues.push("BOOKING_RETENTION_DAYS must be at least 1 in production.");
  }
  if (IS_PRODUCTION && SUPABASE_AUTH_ENABLED && !SUPABASE_MFA_REQUIRED) {
    issues.push("SUPABASE_MFA_REQUIRED must remain enabled in production.");
  }
  if (issues.length) {
    throw new Error(issues.join(" "));
  }
}

let runtimeValidated = false;
function initializeRuntime() {
  if (runtimeValidated) return;
  validateStartupConfig();
  runtimeValidated = true;
}

function getProductionReadinessIssues() {
  if (!IS_PRODUCTION) return [];
  const issues = [];
  if (!hasSupabaseConfig()) issues.push("supabase-storage");
  if (!SUPABASE_AUTH_ENABLED || !SUPABASE_URL || !SUPABASE_ANON_KEY || ADMIN_EMAILS.length === 0) issues.push("supabase-auth");
  if (localAdminEnabled()) issues.push("local-admin-enabled");
  if (!hasCloudinaryConfig()) issues.push("cloudinary");
  if (!FORMSPREE_ENDPOINT) issues.push("formspree");
  if (BOOKING_RETENTION_DAYS < 1) issues.push("booking-retention");
  if (!SUPABASE_MFA_REQUIRED) issues.push("supabase-mfa");
  return issues;
}

const publicFiles = new Map([
  ["/site.html", path.resolve(ROOT, "site.html")],
  ["/site.js", path.resolve(ROOT, "site.js")],
  ["/logo.webp", path.resolve(ROOT, "logo.webp")],
  ["/hero-bg-cricket.webp", path.resolve(ROOT, "hero-bg-cricket.webp")],
  ["/hero-cricket.mp4", path.resolve(ROOT, "hero-cricket.mp4")],
  ["/gallery-local-1.webp", path.resolve(ROOT, "gallery-local-1.webp")],
  ["/gallery-local-2.webp", path.resolve(ROOT, "gallery-local-2.webp")],
  ["/index.html", path.resolve(ROOT, "index.html")],
  ["/admin.css", path.resolve(ROOT, "admin.css")],
  ["/admin.js", path.resolve(ROOT, "admin.js")],
  ["/reset-password.js", path.resolve(ROOT, "reset-password.js")],
  ["/booking-status.js", path.resolve(ROOT, "booking-status.js")],
  ["/booking-confirmation.js", path.resolve(ROOT, "booking-confirmation.js")]
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
    tournaments: normalizeItems(content?.tournaments, "tournaments"),
    images: normalizeItems(content?.images, "images"),
    socials: normalizeItems(content?.socials, "socials"),
    testimonials: normalizeItems(content?.testimonials, "testimonials")
  };
}

const PUBLIC_CONTENT_FIELDS = {
  tournaments: new Set(["id", "name", "status", "date", "prize", "registration", "description", "rules", "registerLink", "cricLink", "tournamentLink", "poster", "published", "featured", "order"]),
  images: new Set(["id", "title", "placement", "alt", "src", "published", "featured", "order"]),
  socials: new Set(["id", "platform", "label", "url", "visible", "published", "featured", "order"]),
  testimonials: new Set(["id", "name", "role", "text", "rating", "avatar", "published", "featured", "order"])
};

function projectPublicContent(content) {
  const normalized = normalizeContent(content);
  return Object.fromEntries(Object.entries(PUBLIC_CONTENT_FIELDS).map(([collection, allowedFields]) => [
    collection,
    normalized[collection]
      .filter((item) => item.published !== false)
      .map((item) => Object.fromEntries(Object.entries(item).filter(([key]) => allowedFields.has(key))))
  ]));
}

const CONTENT_URL_FIELDS = new Set(["registerLink", "cricLink", "tournamentLink", "url"]);
const CONTENT_IMAGE_FIELDS = new Set(["src", "poster", "image", "avatar"]);
const BLOCKED_CONTENT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function sanitizeContentUrl(value, { image = false } = {}) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  if (image && !IS_PRODUCTION && /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(clean)) {
    return clean;
  }
  if (image && /^\/(?!\/)[a-z0-9._~!$&'()*+,;=:@%/-]+$/i.test(clean)) return clean;
  try {
    const parsed = new URL(clean);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.href : "";
  } catch {
    return "";
  }
}

function sanitizeContentValue(key, value) {
  if (CONTENT_URL_FIELDS.has(key)) return sanitizeContentUrl(value);
  if (CONTENT_IMAGE_FIELDS.has(key)) return sanitizeContentUrl(value, { image: true });
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((entry) => String(entry ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 1000));
  }
  if (typeof value === "boolean" || typeof value === "number") return value;
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 10000);
}

function normalizeItems(items, collection = "items") {
  return Array.isArray(items)
    ? items.slice(0, 1000).filter((item) => item && typeof item === "object" && !Array.isArray(item)).map((item, index) => {
      const clean = {};
      for (const [key, value] of Object.entries(item)) {
        if (BLOCKED_CONTENT_KEYS.has(key)) continue;
        clean[key] = sanitizeContentValue(key, value);
      }
      const fallbackId = `${collection}-${index + 1}`;
      clean.id = /^[a-zA-Z0-9_-]{1,100}$/.test(String(clean.id || "")) ? clean.id : fallbackId;
      clean.published = item.published !== false;
      clean.featured = item.featured === true;
      clean.order = Number.isFinite(Number(item.order)) ? Number(item.order) : index + 1;
      return clean;
    })
    : [];
}

function getClientIp(request) {
  if (TRUST_PROXY && request.headers["x-forwarded-for"]) {
    const forwarded = String(request.headers["x-forwarded-for"])
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const trustedBoundaryAddress = forwarded.at(-1) || "";
    if (net.isIP(trustedBoundaryAddress)) return trustedBoundaryAddress;
  }
  return request.socket.remoteAddress || "unknown";
}

function makeRateLimitSubject(value) {
  const clean = String(value || "").trim().toLowerCase();
  return clean ? crypto.createHash("sha256").update(clean).digest("hex").slice(0, 32) : "";
}

function checkRateLimit(request, bucket, limit, windowMs, subject = "") {
  const subjectKey = makeRateLimitSubject(subject);
  const key = `${bucket}:${getClientIp(request)}${subjectKey ? `:${subjectKey}` : ""}`;
  const now = Date.now();
  if (!rateLimits.has(key) && rateLimits.size >= 10000) {
    for (const [storedKey, storedEntry] of rateLimits) {
      if (storedEntry.resetAt < now) rateLimits.delete(storedKey);
    }
    while (rateLimits.size >= 10000) {
      const oldestKey = rateLimits.keys().next().value;
      if (oldestKey === undefined) break;
      rateLimits.delete(oldestKey);
    }
  }
  const entry = rateLimits.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }
  entry.count += 1;
  rateLimits.set(key, entry);
  return entry.count <= limit;
}

async function checkSharedRateLimit(request, bucket, limit, windowMs, subject = "") {
  if (!checkRateLimit(request, bucket, limit, windowMs, subject)) return false;
  if (!hasSupabaseConfig()) return true;

  const action = `rate-limit.${bucket}`;
  const subjectKey = makeRateLimitSubject(subject);
  const address = subjectKey ? `subject:${subjectKey}` : getClientIp(request);
  const cutoff = new Date(Date.now() - windowMs).toISOString();
  const entry = {
    id: `rate-${Date.now().toString(36)}-${crypto.randomBytes(5).toString("hex")}`,
    created_at: new Date().toISOString(),
    actor: "rate-limiter",
    action,
    detail: {},
    ip: address
  };

  try {
    await supabaseRequest(SUPABASE_AUDIT_TABLE, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(entry)
    });
    const rows = await supabaseRequest(`${SUPABASE_AUDIT_TABLE}?action=eq.${encodeURIComponent(action)}&ip=eq.${encodeURIComponent(address)}&created_at=gte.${encodeURIComponent(cutoff)}&select=id&limit=${limit + 1}`);
    return Array.isArray(rows) && rows.length <= limit;
  } catch (error) {
    console.error(`Shared rate limiter unavailable for ${bucket}:`, error.message || error);
    return !/^(?:login|mfa|password-reset|password-update-token|booking-status)/.test(bucket);
  }
}

function commonHeaders(extra = {}) {
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "script-src-attr 'none'",
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

function fetchWithTimeout(url, options = {}, timeoutMs = PROVIDER_TIMEOUT_MS) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
  return fetch(url, { ...options, redirect: "error", signal });
}

async function supabaseRequest(pathname, options = {}) {
  const response = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const detail = (await response.text()).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 500);
    throw new Error(`Supabase ${response.status}: ${detail}`);
  }

  if (response.status === 204) return null;
  const body = await response.text();
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Supabase returned an invalid JSON response.");
  }
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

function startMaintenanceJobs() {
  const sweep = async () => {
    try {
      const deletedBookings = await purgeExpiredBookings();
      const deletedRateEvents = await purgeExpiredRateLimitEvents();
      if (deletedBookings || deletedRateEvents) {
        console.log(`Maintenance removed ${deletedBookings} expired booking(s) and ${deletedRateEvents} rate-limit event(s).`);
      }
    } catch (error) {
      console.error("Scheduled retention sweep failed:", error.message || error);
    }
  };
  const initialSweep = setTimeout(sweep, 1000);
  initialSweep.unref();
  const interval = setInterval(sweep, BOOKING_PURGE_INTERVAL_MS);
  interval.unref();
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
    const rows = await supabaseRequest(`${SUPABASE_AUDIT_TABLE}?action=not.like.rate-limit.*&select=*&order=created_at.desc&limit=100`);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return readLocalAudit();
  }
}

async function purgeExpiredRateLimitEvents() {
  if (!hasSupabaseConfig()) return 0;
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  try {
    const rows = await supabaseRequest(`${SUPABASE_AUDIT_TABLE}?action=like.rate-limit.*&created_at=lt.${encodeURIComponent(cutoff)}`, {
      method: "DELETE",
      headers: { Prefer: "return=representation" }
    });
    return Array.isArray(rows) ? rows.length : 0;
  } catch (error) {
    console.error("Rate-limit event cleanup failed:", error.message || error);
    return 0;
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

function getStaticCacheControl(extname, protectedAsset = false) {
  if (protectedAsset) return "private, no-store";
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
  const allowedContexts = new Set(["tournaments", "gallery", "testimonials", "uploads"]);
  const cleanContext = allowedContexts.has(String(context || "")) ? String(context) : "uploads";
  const folder = `${CLOUDINARY_FOLDER}/${cleanContext}`;
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

  const uploadResponse = await fetchWithTimeout(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
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
  const cleanPublicId = String(publicId || "").trim();
  if (!cleanPublicId) return { ok: true, skipped: true };
  const folderPrefix = `${CLOUDINARY_FOLDER}/`;
  if (cleanPublicId.length > 240 || !/^[a-z0-9_/-]+$/i.test(cleanPublicId) || !cleanPublicId.startsWith(folderPrefix) || cleanPublicId.includes("..")) {
    throw new ValidationError("Invalid HCC image identifier.");
  }
  if (!hasCloudinaryConfig()) return { ok: true, skipped: true };

  const timestamp = Math.floor(Date.now() / 1000);
  const signatureParams = { public_id: cleanPublicId, timestamp };
  const signature = makeCloudinarySignature(signatureParams);
  const form = new FormData();
  form.append("public_id", cleanPublicId);
  form.append("api_key", CLOUDINARY_API_KEY);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);

  const destroyResponse = await fetchWithTimeout(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`, {
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
    const response = await fetchWithTimeout(FORMSPREE_ENDPOINT, {
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
  if (!/^\+?[\d\s().-]+$/.test(cleanPayload.phone)) {
    throw new ValidationError("Use a valid phone number containing numbers and standard phone punctuation only.");
  }
  if (phoneDigits.length < 7 || phoneDigits.length > 15) {
    throw new ValidationError("Phone number must contain 7 to 15 digits.");
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

function sealSecret(value) {
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash("sha256").update(`${SESSION_SECRET}:hcc-session-encryption`).digest();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value || ""), "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

function unsealSecret(value) {
  try {
    const [ivPart, tagPart, encryptedPart] = String(value || "").split(".");
    if (!ivPart || !tagPart || !encryptedPart) return "";
    const key = crypto.createHash("sha256").update(`${SESSION_SECRET}:hcc-session-encryption`).digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encryptedPart, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function makeSessionObjectValue(session, ttlMs = SESSION_TTL_MS, maximumExpiry = Infinity) {
  const issuedAt = Date.now();
  const payload = Buffer.from(JSON.stringify({
    ...session,
    issuedAt,
    expiresAt: Math.min(issuedAt + ttlMs, maximumExpiry)
  })).toString("base64url");
  return `${payload}.${signSession(payload)}`;
}

function parseSignedObject(value) {
  const separator = String(value || "").indexOf(".");
  if (separator === -1) return null;
  const payload = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!timingSafeEqual(signature, signSession(payload))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Number.isFinite(parsed.expiresAt) || Date.now() >= parsed.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
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

function getSession(request) {
  const cookie = parseCookies(request)[SESSION_COOKIE];
  if (!cookie) return null;
  const session = parseSignedObject(cookie);
  if (!session) return null;
  const identity = String(session.identity || "");
  const allowedIdentity = identity === ADMIN_USER || (ADMIN_EMAILS.length > 0 && ADMIN_EMAILS.includes(identity.toLowerCase()));
  if (identity === ADMIN_USER && !localAdminEnabled()) return null;
  return allowedIdentity ? session : null;
}

function getPendingMfaSession(request) {
  const pending = parseSignedObject(parseCookies(request)[MFA_PENDING_COOKIE]);
  if (!pending || pending.provider !== "supabase" || !pending.identity || !pending.accessToken) return null;
  if (ADMIN_EMAILS.length === 0 || !ADMIN_EMAILS.includes(String(pending.identity).toLowerCase())) return null;
  return pending;
}

async function fetchSupabaseUser(accessToken) {
  const response = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`
    }
  });
  const payload = await response.json().catch(() => ({}));
  return response.ok && payload && payload.email ? payload : null;
}

async function validateSupabaseSession(session) {
  if (!hasSupabaseAuthConfig() || session.provider !== "supabase") return null;
  const accessToken = unsealSecret(session.accessToken);
  const claims = decodeJwtPayload(accessToken);
  if (!accessToken || !claims || (SUPABASE_MFA_REQUIRED && claims.aal !== "aal2")) return null;
  const sessionId = String(claims.session_id || "");
  const revokedUntil = revokedSessionIds.get(sessionId) || 0;
  if (revokedUntil > Date.now()) return null;
  if (revokedUntil) revokedSessionIds.delete(sessionId);
  const user = await fetchSupabaseUser(accessToken);
  if (!user) return null;
  const email = String(user.email || "").toLowerCase();
  if (email !== String(session.identity || "").toLowerCase() || ADMIN_EMAILS.length === 0 || !ADMIN_EMAILS.includes(email)) return null;
  if (!session.userId || String(user.id || "") !== String(session.userId) || String(claims.sub || "") !== String(session.userId)) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(claims.session_id || ""))) return null;
  if (SUPABASE_MFA_REQUIRED && (!Array.isArray(user.factors) || !user.factors.some((factor) => factor?.factor_type === "totp" && factor?.status === "verified"))) return null;
  if (session.userUpdatedAt && user.updated_at && session.userUpdatedAt !== user.updated_at) return null;
  return { ...session, accessTokenPlaintext: accessToken };
}

async function isAuthorized(request) {
  if (request.hccAuthChecked) return Boolean(request.hccSession);
  request.hccAuthChecked = true;
  const session = getSession(request);
  if (session?.provider === "supabase") {
    try {
      request.hccSession = await validateSupabaseSession(session);
    } catch (error) {
      console.error("Supabase session validation failed:", error.message || error);
      request.hccSession = null;
    }
    return Boolean(request.hccSession);
  }
  if (session?.provider === "local") {
    request.hccSession = session;
    return true;
  }
  if (isBasicAuthorized(request)) {
    request.hccSession = { identity: ADMIN_USER, provider: "basic", csrfToken: "" };
    return true;
  }
  request.hccSession = null;
  return false;
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
    ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ""}
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

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function makeCookie(name, value, maxAgeSeconds) {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}${IS_PRODUCTION ? "; Secure" : ""}`;
}

function clearCookie(name) {
  return makeCookie(name, "", 0);
}

async function supabaseAuthRequest(pathname, { method = "GET", accessToken = "", body } = {}) {
  const response = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/${pathname}`, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function verifySupabaseLogin(username, password) {
  if (!hasSupabaseAuthConfig()) return null;
  const { response, payload } = await supabaseAuthRequest("token?grant_type=password", {
    method: "POST",
    body: { email: username, password }
  });
  if (!response.ok || !payload.user || !payload.user.email) return null;

  const email = String(payload.user.email).toLowerCase();
  if (ADMIN_EMAILS.length === 0 || !ADMIN_EMAILS.includes(email)) return null;
  const accessToken = String(payload.access_token || "");
  const claims = decodeJwtPayload(accessToken);
  if (!accessToken || !claims || !Number.isFinite(Number(claims.exp)) || Number(claims.exp) * 1000 <= Date.now()) return null;
  const verifiedUser = await fetchSupabaseUser(accessToken);
  if (!verifiedUser || String(verifiedUser.email || "").toLowerCase() !== email || String(verifiedUser.id || "") !== String(claims.sub || "")) return null;
  const factors = Array.isArray(verifiedUser.factors) ? verifiedUser.factors : [];
  const verifiedFactors = factors.filter((factor) => factor?.status === "verified");
  return {
    identity: email,
    provider: "supabase",
    accessToken,
    claims,
    user: verifiedUser,
    verifiedFactorIds: verifiedFactors
      .filter((factor) => factor?.factor_type === "totp" && /^[a-z0-9-]{1,128}$/i.test(String(factor.id || "")))
      .map((factor) => String(factor.id)),
    hasUnsupportedVerifiedFactors: verifiedFactors.some((factor) => factor?.factor_type !== "totp"),
    staleHccFactorIds: factors
      .filter((factor) => factor?.factor_type === "totp" && factor?.status !== "verified" && String(factor?.friendly_name || "").startsWith("HCC Admin") && /^[a-z0-9-]{1,128}$/i.test(String(factor.id || "")))
      .map((factor) => String(factor.id))
  };
}

function makeAdminSession(login) {
  const claims = login.claims || decodeJwtPayload(login.accessToken);
  if (!claims || (SUPABASE_MFA_REQUIRED && claims.aal !== "aal2")) return null;
  const userId = String(login.user?.id || "");
  if (!userId || String(claims.sub || "") !== userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(claims.session_id || ""))) return null;
  if (SUPABASE_MFA_REQUIRED && (!Array.isArray(login.user?.factors) || !login.user.factors.some((factor) => factor?.factor_type === "totp" && factor?.status === "verified"))) return null;
  const tokenExpiry = Number(claims.exp) * 1000;
  if (!Number.isFinite(tokenExpiry) || tokenExpiry <= Date.now()) return null;
  return makeSessionObjectValue({
    identity: login.identity,
    userId,
    provider: "supabase",
    accessToken: sealSecret(login.accessToken),
    userUpdatedAt: String(login.user?.updated_at || ""),
    csrfToken: crypto.randomBytes(32).toString("base64url"),
    aal: String(claims.aal || "aal1"),
    sessionId: String(claims.session_id || "")
  }, SESSION_TTL_MS, tokenExpiry);
}

function sendAdminSessionRedirect(response, value) {
  const session = parseSignedObject(value);
  const maxAge = session ? Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1000)) : 1;
  response.writeHead(302, {
    ...commonHeaders({
      Location: "/admin",
      "Set-Cookie": [makeCookie(SESSION_COOKIE, value, maxAge), clearCookie(MFA_PENDING_COOKIE)],
      "Cache-Control": "no-store"
    })
  });
  response.end();
}

async function handleLogin(request, response) {
  const body = await readBody(request, { maxBytes: MAX_FORM_BYTES, allowedTypes: ["application/x-www-form-urlencoded"] });
  const params = new URLSearchParams(body);
  const username = String(params.get("username") || "").trim().toLowerCase().slice(0, 254);
  const password = params.get("password") || "";
  const ipAllowed = await checkSharedRateLimit(request, "login-ip", 8, 15 * 60 * 1000);
  const accountAllowed = await checkSharedRateLimit(request, "login-account", 8, 15 * 60 * 1000, username);
  if (!ipAllowed || !accountAllowed) {
    sendLoginPage(response, "Too many login attempts. Please try again later.");
    return;
  }

  const supabaseIdentity = await verifySupabaseLogin(username, password);
  const fallbackIdentity = localAdminEnabled() && timingSafeEqual(username, ADMIN_USER) && timingSafeEqual(password, ADMIN_PASSWORD)
    ? { identity: ADMIN_USER, provider: "local" }
    : null;
  if (supabaseIdentity) {
    if (SUPABASE_MFA_REQUIRED && supabaseIdentity.hasUnsupportedVerifiedFactors && supabaseIdentity.verifiedFactorIds.length === 0) {
      sendLoginPage(response, "This account's two-factor configuration is not supported by the HCC admin panel.");
      return;
    }
    if (SUPABASE_MFA_REQUIRED && supabaseIdentity.claims.aal !== "aal2") {
      const pendingValue = makeSessionObjectValue({
        identity: supabaseIdentity.identity,
        userId: String(supabaseIdentity.user?.id || ""),
        provider: "supabase",
        accessToken: sealSecret(supabaseIdentity.accessToken),
        verifiedFactorIds: supabaseIdentity.verifiedFactorIds,
        staleHccFactorIds: supabaseIdentity.staleHccFactorIds,
        csrfToken: crypto.randomBytes(32).toString("base64url")
      }, MFA_PENDING_TTL_MS, Number(supabaseIdentity.claims.exp) * 1000);
      response.writeHead(302, {
        ...commonHeaders({
          Location: "/mfa",
          "Set-Cookie": [makeCookie(MFA_PENDING_COOKIE, pendingValue, MFA_PENDING_TTL_MS / 1000), clearCookie(SESSION_COOKIE)],
          "Cache-Control": "no-store"
        })
      });
      response.end();
      return;
    }
    const value = makeAdminSession(supabaseIdentity);
    if (value) {
      sendAdminSessionRedirect(response, value);
      return;
    }
  }

  if (fallbackIdentity) {
    const value = makeSessionObjectValue({
      ...fallbackIdentity,
      csrfToken: crypto.randomBytes(32).toString("base64url")
    });
    sendAdminSessionRedirect(response, value);
    return;
  }

  sendLoginPage(response, "Invalid username or password.");
}

function sendMfaPage(response, pending, { errorMessage = "", setCookie = "", enrollment = null } = {}) {
  const factorId = String(pending?.enrollmentFactorId || pending?.verifiedFactorIds?.[0] || "");
  const needsEnrollment = !factorId;
  const qrCode = String(enrollment?.qrCode || "");
  const safeQrCode = qrCode.length <= 100000 && /^data:image\/svg\+xml(?:;[^,]*)?,/i.test(qrCode) ? qrCode : "";
  response.writeHead(200, {
    ...commonHeaders({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      ...(setCookie ? { "Set-Cookie": setCookie } : {})
    })
  });
  response.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex,nofollow">
  <title>HCC Admin Two-Factor Authentication</title>
  <style>
    :root { --red:#c8101e; --green:#0b5a38; --ink:#151a16; --line:rgba(12,83,51,.16); }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px; font-family:Arial,sans-serif; color:var(--ink); background:linear-gradient(135deg,#fffaf0,#eef6ea); }
    main { width:min(440px,100%); padding:28px; border:1px solid var(--line); border-radius:10px; background:#fff; box-shadow:0 20px 70px rgba(18,23,19,.14); }
    img.logo { width:64px; height:64px; object-fit:contain; margin-bottom:16px; }
    img.qr { display:block; width:min(240px,100%); margin:20px auto; }
    h1 { margin:0 0 8px; font-size:1.7rem; }
    p { color:#607066; line-height:1.5; overflow-wrap:anywhere; }
    code { display:block; padding:10px; border-radius:8px; background:#f4f4f1; overflow-wrap:anywhere; }
    label { display:grid; gap:7px; margin-top:16px; color:#607066; font-size:.78rem; font-weight:700; letter-spacing:1px; text-transform:uppercase; }
    input { width:100%; border:1px solid var(--line); border-radius:8px; padding:13px; font:inherit; }
    button { width:100%; min-height:46px; margin-top:20px; border:0; border-radius:8px; color:#fff; background:var(--red); font-weight:800; letter-spacing:1px; text-transform:uppercase; cursor:pointer; }
    .error { margin-top:14px; padding:11px 12px; border-radius:8px; color:#8e0712; background:rgba(200,16,30,.08); }
    a { display:inline-block; margin-top:18px; color:var(--green); font-weight:700; }
  </style>
</head>
<body>
  <main>
    <img class="logo" src="/logo.webp" alt="HCC logo">
    <h1>${needsEnrollment ? "Secure your account" : "Two-factor verification"}</h1>
    <p>${needsEnrollment
      ? "HCC admin access requires an authenticator app. Start enrollment to create a time-based one-time password factor."
      : enrollment
        ? "Scan this QR code with an authenticator app, then enter the six-digit code to finish enrollment."
        : "Enter the six-digit code from your authenticator app."}</p>
    ${safeQrCode ? `<img class="qr" src="${escapeHtml(safeQrCode)}" alt="Authenticator setup QR code">` : ""}
    ${enrollment?.secret ? `<p>If you cannot scan the code, enter this secret manually:</p><code>${escapeHtml(String(enrollment.secret))}</code>` : ""}
    <form method="POST" action="${needsEnrollment ? "/mfa/enroll" : "/mfa/verify"}">
      <input type="hidden" name="csrf" value="${escapeHtml(String(pending?.csrfToken || ""))}">
      ${needsEnrollment ? "" : '<label>Authenticator code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label>'}
      <button type="submit">${needsEnrollment ? "Set up authenticator" : "Verify and sign in"}</button>
    </form>
    ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ""}
    <a href="/login">Cancel and sign in again</a>
  </main>
</body>
</html>`);
}

async function handleMfaEnroll(request, response) {
  const pending = getPendingMfaSession(request);
  if (!pending) {
    redirectToLogin(response);
    return;
  }
  const params = new URLSearchParams(await readBody(request, { maxBytes: MAX_FORM_BYTES, allowedTypes: ["application/x-www-form-urlencoded"] }));
  if (!timingSafeEqual(String(params.get("csrf") || ""), String(pending.csrfToken || ""))) {
    sendJson(response, 403, { error: "Invalid security token" });
    return;
  }
  const accessToken = unsealSecret(pending.accessToken);
  for (const factorId of Array.isArray(pending.staleHccFactorIds) ? pending.staleHccFactorIds : []) {
    const { response: deleteResponse } = await supabaseAuthRequest(`factors/${encodeURIComponent(factorId)}`, {
      method: "DELETE",
      accessToken
    });
    if (!deleteResponse.ok) {
      sendMfaPage(response, pending, { errorMessage: "A previous authenticator setup could not be cleared. Sign in again and retry." });
      return;
    }
  }
  const { response: enrollResponse, payload } = await supabaseAuthRequest("factors", {
    method: "POST",
    accessToken,
    body: { factor_type: "totp", friendly_name: "HCC Admin Console", issuer: "Hamriyah Cricket Centre" }
  });
  const factorId = String(payload.id || "");
  if (!enrollResponse.ok || !/^[a-z0-9-]{1,128}$/i.test(factorId) || !payload.totp) {
    sendMfaPage(response, pending, { errorMessage: "Authenticator setup could not be started. Sign in again and retry." });
    return;
  }
  const rawQrCode = String(payload.totp.qr_code || "");
  const encodedQrCode = rawQrCode.trim().startsWith("<svg")
    ? `data:image/svg+xml;base64,${Buffer.from(rawQrCode, "utf8").toString("base64")}`
    : rawQrCode;
  const nextPending = {
    ...pending,
    enrollmentFactorId: factorId,
    staleHccFactorIds: []
  };
  const pendingValue = makeSessionObjectValue(nextPending, MFA_PENDING_TTL_MS);
  sendMfaPage(response, parseSignedObject(pendingValue), {
    setCookie: makeCookie(MFA_PENDING_COOKIE, pendingValue, MFA_PENDING_TTL_MS / 1000),
    enrollment: {
      qrCode: encodedQrCode,
      secret: String(payload.totp.secret || "")
    }
  });
}

async function handleMfaVerify(request, response) {
  const pending = getPendingMfaSession(request);
  if (!pending) {
    redirectToLogin(response);
    return;
  }
  const params = new URLSearchParams(await readBody(request, { maxBytes: MAX_FORM_BYTES, allowedTypes: ["application/x-www-form-urlencoded"] }));
  if (!timingSafeEqual(String(params.get("csrf") || ""), String(pending.csrfToken || ""))) {
    sendJson(response, 403, { error: "Invalid security token" });
    return;
  }
  const code = String(params.get("code") || "").trim();
  const factorId = String(pending.enrollmentFactorId || pending.verifiedFactorIds?.[0] || "");
  if (!/^\d{6}$/.test(code) || !/^[a-z0-9-]{1,128}$/i.test(factorId)) {
    sendMfaPage(response, pending, { errorMessage: "Enter a valid six-digit authenticator code." });
    return;
  }
  const ipAllowed = await checkSharedRateLimit(request, "mfa-ip", 10, 15 * 60 * 1000);
  const accountAllowed = await checkSharedRateLimit(request, "mfa-account", 10, 15 * 60 * 1000, pending.identity);
  if (!ipAllowed || !accountAllowed) {
    sendMfaPage(response, pending, { errorMessage: "Too many verification attempts. Sign in again later." });
    return;
  }

  const accessToken = unsealSecret(pending.accessToken);
  const { response: challengeResponse, payload: challenge } = await supabaseAuthRequest(`factors/${encodeURIComponent(factorId)}/challenge`, {
    method: "POST",
    accessToken,
    body: {}
  });
  if (!challengeResponse.ok || !challenge.id) {
    sendMfaPage(response, pending, { errorMessage: "Verification could not be started. Sign in again and retry." });
    return;
  }
  const { response: verifyResponse, payload } = await supabaseAuthRequest(`factors/${encodeURIComponent(factorId)}/verify`, {
    method: "POST",
    accessToken,
    body: { challenge_id: challenge.id, code }
  });
  const upgradedToken = String(payload.access_token || "");
  const claims = decodeJwtPayload(upgradedToken);
  if (!verifyResponse.ok || !claims || claims.aal !== "aal2") {
    sendMfaPage(response, pending, { errorMessage: "That authenticator code was not accepted." });
    return;
  }
  const user = await fetchSupabaseUser(upgradedToken);
  const email = String(user?.email || "").toLowerCase();
  if (email !== String(pending.identity).toLowerCase() || String(user?.id || "") !== String(pending.userId || "") || String(claims.sub || "") !== String(pending.userId || "") || !ADMIN_EMAILS.includes(email)) {
    sendMfaPage(response, pending, { errorMessage: "This account is not allowed to access HCC admin." });
    return;
  }
  const value = makeAdminSession({ identity: email, accessToken: upgradedToken, claims, user });
  if (!value) {
    sendMfaPage(response, pending, { errorMessage: "A secure admin session could not be created." });
    return;
  }
  sendAdminSessionRedirect(response, value);
}

async function handleLogout(request, response) {
  const session = request.hccSession || getSession(request);
  const accessToken = session?.provider === "supabase" ? (session.accessTokenPlaintext || unsealSecret(session.accessToken)) : "";
  if (session?.sessionId) revokedSessionIds.set(String(session.sessionId), Number(session.expiresAt) || Date.now() + SESSION_TTL_MS);
  if (accessToken && hasSupabaseAuthConfig()) {
    try {
      const { response: logoutResponse } = await supabaseAuthRequest("logout?scope=global", { method: "POST", accessToken });
      if (!logoutResponse.ok) console.error(`Supabase global logout failed with status ${logoutResponse.status}.`);
    } catch (error) {
      console.error("Supabase global logout failed:", error.message || error);
    }
  }
  response.writeHead(302, {
    ...commonHeaders({
      Location: "/login",
      "Set-Cookie": [clearCookie(SESSION_COOKIE), clearCookie(MFA_PENDING_COOKIE)],
      "Cache-Control": "no-store"
    })
  });
  response.end();
}

function requiresAdminAuth(pathname, method = "GET") {
  if (pathname === "/api/content" && method !== "GET") return true;
  if (pathname === "/api/upload") return true;
  if (pathname === "/api/cloudinary/delete") return true;
  if (pathname === "/api/session") return true;
  if (pathname === "/api/audit") return true;
  if (pathname === "/api/bookings" || pathname.startsWith("/api/bookings/")) return true;
  if (pathname === "/api/password-reset") return true;
  if (pathname === "/api/password-update") return true;
  if (pathname === "/logout") return true;
  return pathname === "/admin" ||
    pathname === "/index.html" ||
    pathname === "/admin.css" ||
    pathname === "/admin.js";
}

function isSameOriginWrite(request, { requireHeader = false } = {}) {
  if (!new Set(["POST", "PUT", "PATCH", "DELETE"]).has(request.method)) return true;
  if (String(request.headers["sec-fetch-site"] || "").toLowerCase() === "cross-site") return false;

  const suppliedOrigin = request.headers.origin || request.headers.referer;
  if (!suppliedOrigin) return !requireHeader;
  try {
    return new URL(suppliedOrigin).origin === getTrustedOrigin(request);
  } catch {
    return false;
  }
}

function hasValidCsrfToken(request) {
  const session = request.hccSession;
  if (!session) return false;
  if (session.provider === "basic") return isSameOriginWrite(request, { requireHeader: true });
  const supplied = String(request.headers["x-hcc-csrf"] || "");
  return Boolean(session.csrfToken) && timingSafeEqual(supplied, session.csrfToken);
}

function readBody(request, { maxBytes = MAX_JSON_BYTES, allowedTypes = [] } = {}) {
  return new Promise((resolve, reject) => {
    if (activeBodyReads >= MAX_CONCURRENT_BODY_READS) {
      const error = new Error("The server is busy. Please retry shortly.");
      error.statusCode = 503;
      request.resume();
      reject(error);
      return;
    }
    const contentType = String(request.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
    if (allowedTypes.length && !allowedTypes.includes(contentType)) {
      const error = new Error("Unsupported content type");
      error.statusCode = 415;
      request.resume();
      reject(error);
      return;
    }
    const rawLength = request.headers["content-length"];
    if (rawLength !== undefined) {
      const contentLength = Number(rawLength);
      if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
        const error = new Error("Invalid Content-Length");
        error.statusCode = 400;
        request.resume();
        reject(error);
        return;
      }
      if (contentLength > maxBytes) {
        const error = new Error("Request body too large");
        error.statusCode = 413;
        request.resume();
        reject(error);
        return;
      }
    }

    activeBodyReads += 1;
    const chunks = [];
    let size = 0;
    let settled = false;
    const finish = () => {
      if (settled) return false;
      settled = true;
      activeBodyReads = Math.max(0, activeBodyReads - 1);
      return true;
    };
    request.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) {
        finish();
        const error = new Error("Request body too large");
        error.statusCode = 413;
        reject(error);
        request.resume();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (finish()) resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", (error) => {
      if (finish()) reject(error);
    });
    request.on("aborted", () => {
      if (finish()) reject(new Error("Request aborted"));
    });
  });
}

async function readJsonBody(request, maxBytes = MAX_JSON_BYTES) {
  const body = await readBody(request, { maxBytes, allowedTypes: ["application/json"] });
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid JSON object");
    return parsed;
  } catch {
    throw new ValidationError("Invalid JSON request body.");
  }
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
    ${message ? `<div class="message">${escapeHtml(message)}</div>` : ""}
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
  if (ADMIN_EMAILS.length === 0 || !ADMIN_EMAILS.includes(cleanEmail)) {
    return { ok: true };
  }

  const redirectTo = `${getTrustedOrigin(request)}/reset-password`;
  const resetResponse = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email: cleanEmail })
  });
  const payload = await resetResponse.json().catch(() => ({}));
  if (!resetResponse.ok) throw new Error("Password reset failed.");
  return { ok: true };
}

async function updateSupabasePasswordWithSession(session, currentPassword, newPassword) {
  if (!hasSupabaseAuthConfig()) throw new Error("Supabase Auth is not configured.");
  if (!session?.identity || !currentPassword || !newPassword) throw new Error("Current and new passwords are required.");
  if (String(newPassword).length < 8) throw new Error("New password must be at least 8 characters.");
  const accessToken = session.accessTokenPlaintext || unsealSecret(session.accessToken);
  if (!accessToken) throw new Error("Your admin session has expired.");
  return updateSupabasePasswordWithToken(accessToken, newPassword, currentPassword);
}

async function updateSupabasePasswordWithToken(accessToken, newPassword, currentPassword = "") {
  if (!hasSupabaseAuthConfig()) throw new Error("Supabase Auth is not configured.");
  if (!accessToken || !newPassword) throw new Error("Access token and new password are required.");
  if (String(newPassword).length < 8) throw new Error("New password must be at least 8 characters.");

  const updateResponse = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ password: newPassword, ...(currentPassword ? { current_password: currentPassword } : {}) })
  });
  const payload = await updateResponse.json().catch(() => ({}));
  if (!updateResponse.ok) throw new Error("Password update failed. Check the current password and try again.");
  try {
    await supabaseAuthRequest("logout?scope=global", { method: "POST", accessToken });
  } catch {
    // Supabase may invalidate the access token immediately after a password change.
  }
  return { ok: true };
}

async function updateSupabasePasswordFromRecovery(accessToken, newPassword, mfaCode) {
  if (!hasSupabaseAuthConfig()) throw new Error("Supabase Auth is not configured.");
  const cleanToken = String(accessToken || "");
  const claims = decodeJwtPayload(cleanToken);
  const authMethods = Array.isArray(claims?.amr)
    ? claims.amr.map((entry) => typeof entry === "string" ? entry : entry?.method).filter(Boolean)
    : [];
  if (!claims || !authMethods.includes("recovery") || Number(claims.exp) * 1000 <= Date.now()) {
    throw new ValidationError("This password reset link is invalid or expired.");
  }
  const user = await fetchSupabaseUser(cleanToken);
  const email = String(user?.email || "").toLowerCase();
  if (!user || String(user.id || "") !== String(claims.sub || "") || !ADMIN_EMAILS.includes(email)) {
    throw new ValidationError("This password reset link is invalid or expired.");
  }

  const factors = Array.isArray(user.factors)
    ? user.factors.filter((factor) => factor?.factor_type === "totp" && factor?.status === "verified" && /^[a-z0-9-]{1,128}$/i.test(String(factor.id || "")))
    : [];
  let verifiedToken = cleanToken;
  if (factors.length) {
    const code = String(mfaCode || "").trim();
    if (!/^\d{6}$/.test(code)) throw new ValidationError("Enter the six-digit code from your authenticator app.");
    const factorId = String(factors[0].id);
    const { response: challengeResponse, payload: challenge } = await supabaseAuthRequest(`factors/${encodeURIComponent(factorId)}/challenge`, {
      method: "POST",
      accessToken: cleanToken,
      body: {}
    });
    if (!challengeResponse.ok || !challenge.id) throw new ValidationError("Authenticator verification failed.");
    const { response: verifyResponse, payload } = await supabaseAuthRequest(`factors/${encodeURIComponent(factorId)}/verify`, {
      method: "POST",
      accessToken: cleanToken,
      body: { challenge_id: challenge.id, code }
    });
    const upgradedClaims = decodeJwtPayload(payload.access_token);
    if (!verifyResponse.ok || !upgradedClaims || upgradedClaims.aal !== "aal2" || String(upgradedClaims.sub || "") !== String(user.id)) {
      throw new ValidationError("Authenticator verification failed.");
    }
    verifiedToken = String(payload.access_token);
  }
  return updateSupabasePasswordWithToken(verifiedToken, newPassword);
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
      <label>Authenticator code (if enrolled)<input id="mfaCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6"></label>
      <button type="submit">Update password</button>
    </form>
    <div class="message" id="message" hidden></div>
    <a href="/login">Back to login</a>
  </main>
  <script src="/reset-password.js" defer></script>
</body>
</html>`);
}

function serveFile(requestPathname, response, { protectedAsset = false } = {}) {
  let routePath = requestPathname;
  if (routePath === "/") routePath = "/site.html";
  if (routePath === "/admin") routePath = "/index.html";
  const safePath = publicFiles.get(routePath);
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
        "Cache-Control": getStaticCacheControl(extname, protectedAsset)
      })
    });
    response.end(file);
  });
}

function sendRobots(request, response) {
  const origin = getTrustedOrigin(request);
  response.writeHead(200, commonHeaders({
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "public, max-age=300"
  }));
  response.end(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /login\nDisallow: /reset-request\nDisallow: /reset-password\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`);
}

function sendSitemap(request, response) {
  const origin = getTrustedOrigin(request);
  response.writeHead(200, commonHeaders({ "Content-Type": "application/xml; charset=utf-8" }));
  response.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${origin}/</loc><priority>1.0</priority></url>\n  <url><loc>${origin}/booking-status</loc><priority>0.5</priority></url>\n  <url><loc>${origin}/privacy</loc><priority>0.3</priority></url>\n  <url><loc>${origin}/terms</loc><priority>0.3</priority></url>\n</urlset>\n`);
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

function canonicalizePathname(rawPathname) {
  try {
    const pathname = decodeURIComponent(String(rawPathname || "/"));
    if (!pathname.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(pathname)) {
      throw new Error("Invalid request path");
    }
    return pathname;
  } catch {
    const error = new Error("Invalid request path");
    error.statusCode = 400;
    throw error;
  }
}

function resolveRequestPath(parsed) {
  if (parsed.searchParams.has("path")) {
    const raw = String(parsed.searchParams.get("path") || "");
    return canonicalizePathname(raw ? (raw.startsWith("/") ? raw : `/${raw}`) : "/");
  }
  if (parsed.pathname === "/api/index" || parsed.pathname === "/api/index.mjs" || parsed.pathname === "/api/index.js") {
    return "/";
  }
  return canonicalizePathname(parsed.pathname);
}

function authMode() {
  if (hasSupabaseAuthConfig()) return "supabase-auth";
  if (localAdminEnabled()) return "local-admin";
  return "misconfigured";
}

function sendBookingStatusPage(response) {
  response.writeHead(200, {
    ...commonHeaders({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" })
  });
  response.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="index,follow">
  <title>Check Booking Status | Hamriyah Cricket Centre</title>
  <meta name="description" content="Track a Hamriyah Cricket Centre booking request using its reference and matching email address.">
  <style>
    :root { --red:#c8101e; --ink:#18191c; --muted:#686b72; --cream:#f5f3ed; --line:#e2dfd6; --green:#0b6b43; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; font-family:Arial,sans-serif; color:var(--ink); background:radial-gradient(circle at 85% 15%,rgba(200,16,30,.16),transparent 30%),linear-gradient(145deg,#faf8f1,#f0eee8); }
    header { width:min(1080px,calc(100% - 32px)); margin:0 auto; padding:24px 0; display:flex; align-items:center; justify-content:space-between; gap:18px; }
    .brand { display:flex; align-items:center; gap:12px; color:var(--ink); text-decoration:none; font-weight:900; letter-spacing:.05em; }
    .brand img { width:48px; height:48px; object-fit:contain; }
    .back { color:var(--ink); text-decoration:none; font-weight:800; font-size:.82rem; letter-spacing:.05em; }
    main { width:min(780px,calc(100% - 32px)); margin:36px auto 80px; }
    .eyebrow { color:var(--red); font-size:.78rem; font-weight:900; letter-spacing:.16em; text-transform:uppercase; }
    h1 { margin:10px 0 12px; max-width:650px; font-size:clamp(2.7rem,9vw,5.6rem); line-height:.9; letter-spacing:-.035em; text-transform:uppercase; }
    .intro { max-width:600px; margin:0 0 32px; color:var(--muted); font-size:1.04rem; line-height:1.65; }
    .card { padding:clamp(22px,5vw,44px); border:1px solid var(--line); border-radius:24px; background:rgba(255,255,255,.94); box-shadow:0 24px 80px rgba(24,25,28,.12); }
    .secure { display:flex; align-items:center; gap:10px; margin-bottom:26px; color:var(--muted); font-size:.88rem; line-height:1.45; }
    .secure span { width:34px; height:34px; display:grid; place-items:center; flex:0 0 34px; border-radius:50%; background:#fff0f1; color:var(--red); }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
    label { display:grid; gap:8px; color:var(--ink); font-size:.75rem; font-weight:900; letter-spacing:.09em; text-transform:uppercase; }
    input { width:100%; min-height:54px; padding:0 15px; border:1.5px solid var(--line); border-radius:14px; background:var(--cream); color:var(--ink); font:inherit; outline:none; }
    input:focus { border-color:var(--red); box-shadow:0 0 0 3px rgba(200,16,30,.09); }
    button { width:100%; min-height:56px; margin-top:20px; border:0; border-radius:28px; background:var(--ink); color:#fff; cursor:pointer; font-weight:900; letter-spacing:.08em; text-transform:uppercase; }
    button:disabled { cursor:wait; opacity:.55; }
    .message { display:none; margin-top:18px; padding:15px 16px; border-radius:14px; line-height:1.55; }
    .message.visible { display:block; }
    .message.error { background:#fff4e5; border:1px solid #f1b45d; color:#8a4300; }
    .message.success { background:#edf8f2; border:1px solid #b8ddc9; color:var(--green); }
    .reference { display:block; margin-top:7px; color:var(--red); font-weight:900; letter-spacing:.04em; }
    .privacy { margin:18px 4px 0; color:var(--muted); font-size:.82rem; line-height:1.55; }
    .privacy a { color:var(--ink); }
    @media (max-width:620px) { header { align-items:flex-start; } .brand { font-size:.76rem; } .grid { grid-template-columns:1fr; } main { margin-top:20px; } }
  </style>
</head>
<body>
  <header>
    <a class="brand" href="/"><img src="/logo.webp" alt="HCC"><span>HAMRIYAH CRICKET CENTRE</span></a>
    <a class="back" href="/#booking">← BACK TO BOOKING</a>
  </header>
  <main>
    <span class="eyebrow">Your request</span>
    <h1>Track your booking.</h1>
    <p class="intro">Enter the reference shown after submission and the same email address used for the request.</p>
    <section class="card" aria-labelledby="status-form-title">
      <div class="secure"><span aria-hidden="true">✓</span><div id="status-form-title">For privacy, both details must match. HCC never shows your phone number or private staff notes here.</div></div>
      <form id="status-form" novalidate>
        <div class="grid">
          <label>Booking reference<input name="reference" type="text" placeholder="HCC-20260715-A1B2C3D4" autocomplete="off" maxlength="40"></label>
          <label>Email address<input name="email" type="email" placeholder="you@example.com" autocomplete="email" maxlength="254"></label>
        </div>
        <button type="submit">Check status</button>
      </form>
      <div class="message" id="status-result" role="status" aria-live="polite"></div>
      <p class="privacy">Having trouble? Contact HCC using the details on the <a href="/#contact">website</a>. Read our <a href="/privacy">Privacy Policy</a>.</p>
    </section>
  </main>
  <script src="/booking-status.js" defer></script>
</body>
</html>`);
}

function sendBookingConfirmationPage(response) {
  response.writeHead(200, {
    ...commonHeaders({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" })
  });
  response.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex,nofollow">
  <title>Booking Request Received | Hamriyah Cricket Centre</title>
  <style>
    :root { --red:#c8101e; --ink:#18191c; --muted:#686b72; --cream:#f5f3ed; --line:#e2dfd6; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; font-family:Arial,sans-serif; color:var(--ink); background:radial-gradient(circle at 85% 15%,rgba(200,16,30,.16),transparent 30%),linear-gradient(145deg,#faf8f1,#f0eee8); }
    header { width:min(1080px,calc(100% - 32px)); margin:0 auto; padding:24px 0; display:flex; align-items:center; justify-content:space-between; gap:18px; }
    .brand { display:flex; align-items:center; gap:12px; color:var(--ink); text-decoration:none; font-weight:900; letter-spacing:.05em; }
    .brand img { width:48px; height:48px; object-fit:contain; }
    main { width:min(720px,calc(100% - 32px)); margin:24px auto 70px; text-align:center; }
    .check { width:82px; height:82px; margin:0 auto 22px; display:grid; place-items:center; border-radius:50%; background:var(--red); color:#fff; font-size:2.5rem; font-weight:900; box-shadow:0 16px 38px rgba(200,16,30,.3); }
    .eyebrow { color:var(--red); font-size:.78rem; font-weight:900; letter-spacing:.16em; text-transform:uppercase; }
    h1 { margin:10px auto 14px; max-width:670px; font-size:clamp(2.5rem,8vw,5rem); line-height:.92; letter-spacing:-.035em; text-transform:uppercase; }
    .intro { max-width:580px; margin:0 auto 28px; color:var(--muted); font-size:1.02rem; line-height:1.65; }
    .card { padding:clamp(22px,5vw,40px); border:1px solid var(--line); border-radius:24px; background:rgba(255,255,255,.95); box-shadow:0 24px 80px rgba(24,25,28,.12); text-align:left; }
    .reference { padding:20px; border:2px solid var(--red); border-radius:18px; text-align:center; background:#fff8f8; }
    .reference-label { display:block; color:var(--muted); font-size:.72rem; font-weight:900; letter-spacing:.13em; text-transform:uppercase; }
    .reference-value { display:block; margin-top:7px; overflow-wrap:anywhere; color:var(--red); font-size:clamp(1.45rem,6vw,2.25rem); font-weight:900; letter-spacing:.04em; }
    .reference-help { margin:8px 0 0; color:var(--muted); font-size:.82rem; line-height:1.45; }
    .details { margin-top:18px; display:grid; gap:10px; }
    .detail { padding:15px 17px; border:1px solid var(--line); border-radius:15px; background:var(--cream); }
    .detail-label { display:block; margin-bottom:5px; color:var(--muted); font-size:.69rem; font-weight:900; letter-spacing:.1em; text-transform:uppercase; }
    .detail-value { color:var(--ink); font-weight:800; line-height:1.45; }
    .warning { display:none; margin-top:16px; padding:14px 16px; border:1px solid #f1b45d; border-radius:14px; background:#fff4e5; color:#8a4300; font-size:.88rem; font-weight:700; line-height:1.5; }
    .actions { margin-top:22px; display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .button { min-height:54px; padding:0 18px; display:flex; align-items:center; justify-content:center; border:1px solid var(--ink); border-radius:27px; color:#fff; background:var(--ink); text-decoration:none; font-size:.78rem; font-weight:900; letter-spacing:.08em; text-transform:uppercase; }
    .button.secondary { color:var(--ink); background:#fff; }
    .missing { display:none; padding:26px; border:1px solid var(--line); border-radius:20px; background:#fff; }
    @media (max-width:600px) { header { justify-content:center; } .brand { font-size:.76rem; } main { margin-top:12px; } .actions { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <header><a class="brand" href="/"><img src="/logo.webp" alt="HCC"><span>HAMRIYAH CRICKET CENTRE</span></a></header>
  <main>
    <div id="confirmation-content" hidden>
      <div class="check" aria-hidden="true">✓</div>
      <span class="eyebrow">Request received</span>
      <h1>HCC has your request.</h1>
      <p class="intro">Your request has been saved. The HCC team will contact you to confirm availability and the final booking details.</p>
      <section class="card" aria-label="Booking confirmation">
        <div class="reference">
          <span class="reference-label">Booking reference</span>
          <strong class="reference-value" id="confirmation-reference"></strong>
          <p class="reference-help">Keep this reference. You will need it with your email address to check the booking status.</p>
        </div>
        <div class="details">
          <div class="detail"><span class="detail-label">Request type</span><span class="detail-value" id="confirmation-type"></span></div>
          <div class="detail"><span class="detail-label">Booking</span><span class="detail-value" id="confirmation-title"></span></div>
          <div class="detail" id="confirmation-detail-row"><span class="detail-label">Details</span><span class="detail-value" id="confirmation-detail"></span></div>
        </div>
        <div class="warning" id="confirmation-warning">Your request is saved, but the staff email notification is delayed. HCC can still see it in the booking dashboard.</div>
        <div class="actions">
          <a class="button" href="/booking-status">Check booking status</a>
          <a class="button secondary" href="/#booking">Make another request</a>
        </div>
      </section>
    </div>
    <section class="missing" id="confirmation-missing">
      <h1>No recent request found.</h1>
      <p class="intro">Submit a booking request first, then this page will show its reference.</p>
      <a class="button" href="/#booking">Go to booking</a>
    </section>
  </main>
  <script src="/booking-confirmation.js" defer></script>
</body>
</html>`);
}

function sendLegalPage(response, type) {
  const isPrivacy = type === "privacy";
  const title = isPrivacy ? "Privacy Policy" : "Terms of Use";
  const sections = isPrivacy
    ? [
      {
        heading: "1. Who We Are",
        paragraphs: [
          "Hamriyah Cricket Centre (\"HCC\", \"we\", \"our\", or \"us\"), located in Hamriyah West, Sharjah, United Arab Emirates, controls the personal information described in this policy.",
          "This policy applies when you use the HCC website or mobile application, contact our team, submit booking or tournament enquiries, or otherwise interact with our online services."
        ]
      },
      {
        heading: "2. Information We Collect",
        paragraphs: [
          "We may collect personal information that you voluntarily provide to us, including your full name, phone number, email address, team name or organization name, booking details, tournament registration details, preferred dates and times, messages, comments, notes, and any other information you choose to provide through forms or direct contact.",
          "We may also collect limited technical information automatically when you use the website, app, or booking service, such as your IP address, browser or request information, access times, and basic security and server error log information. The app does not request access to contacts, camera, microphone, precise location, photos, or payment information."
        ]
      },
      {
        heading: "3. How We Collect Information",
        paragraphs: [
          "We collect information when you submit a booking enquiry through the website or app, register interest in a tournament, contact us by form, email, or phone, when an administrator manages content, and when your browser or app interacts with our service for technical, security, or performance purposes."
        ]
      },
      {
        heading: "4. Why We Use Your Information",
        paragraphs: [
          "We use your information only to provide website, app, and booking functionality, respond to booking, enquiry, or registration requests, communicate about availability and tournaments, provide customer support, maintain necessary operational records, prevent misuse, spam, fraud, and unauthorized access, and comply with legal or regulatory obligations.",
          "We do not sell personal information, use it for advertising, or track users across other companies' apps or websites."
        ]
      },
      {
        heading: "5. Booking Forms and Communications",
        paragraphs: [
          "When you submit a form through our website or app, your information is processed by the HCC booking service, stored in HCC's booking system, and forwarded to our configured form handling provider for staff notification and response management.",
          "By submitting a form, you acknowledge that we may contact you by phone, email, or messaging applications in relation to your enquiry, booking, registration, or follow-up service communication."
        ]
      },
      {
        heading: "6. Service Providers",
        paragraphs: [
          "We use service providers that may process information on our behalf: Render hosts the HCC website and booking service, Supabase stores booking and managed content records and supports secure staff access, Formspree delivers booking-form notifications, and Cloudinary delivers public media.",
          "Apple or Google may separately process app-store and device information under their own terms. We do not give booking details to advertising networks or data brokers."
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
          "By using the website or app and choosing to submit a request, you acknowledge the processing described in this policy for enquiries, bookings, tournament coordination, customer communication, security, and service management."
        ]
      },
      {
        heading: "9. How Long We Keep Information",
        paragraphs: [
          "Booking records are kept only while reasonably required to review and manage the request, maintain necessary business records, resolve disputes, prevent misuse, or meet legal obligations, and are then deleted or anonymised. HCC staff can permanently delete a booking from the protected admin system.",
          "Provider backups or security logs may remain for a limited additional period under the provider's retention schedule."
        ]
      },
      {
        heading: "10. Data Sharing",
        paragraphs: [
          "We disclose information only where reasonably necessary, including to the service providers named above acting on our behalf, to authorized HCC staff who need it to respond or manage operations, where required by law or legal process, or where necessary to protect our rights, users, systems, or operations.",
          "We do not sell or rent personal information as a standalone business activity."
        ]
      },
      {
        heading: "11. International Data Processing",
        paragraphs: [
          "Some providers used by the website and app may store or process data on servers outside the United Arab Emirates. By choosing to submit your information, you understand that such transfers may occur as part of normal service operations.",
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
          "Subject to applicable law, you may request access to personal information we hold about you, correction or deletion, object to or restrict certain processing, withdraw a consent where processing relies on consent, or ask how information is used.",
          "To make a privacy-related request, email info@hamriyahcricketcentre.ae and include your booking reference if available. We may need to verify your identity before fulfilling a request. There is no website or app customer account to delete."
        ]
      },
      {
        heading: "14. Children's Privacy",
        paragraphs: [
          "The website and app are general sports-venue information and enquiry services and are not designed for children. If a parent or guardian believes that a child submitted personal information inappropriately, they may contact us and request its review or deletion."
        ]
      },
      {
        heading: "15. Third-Party Links",
        paragraphs: [
          "Our website or app may open third-party websites, maps, social media pages, tournament platforms, phone, or email services. The app opens the venue in an external map and does not request device location permission. We are not responsible for services outside our control."
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
        heading: "1. About These Services",
        paragraphs: [
          "These Terms of Use govern your access to and use of the Hamriyah Cricket Centre website, mobile application, content, forms, and related online services.",
          "These services are operated by Hamriyah Cricket Centre (\"HCC\", \"we\", \"our\", or \"us\"), located in Hamriyah West, Sharjah, United Arab Emirates, for informational, enquiry, communication, and administrative purposes related to our cricket facilities, bookings, tournaments, and media."
        ]
      },
      {
        heading: "2. Acceptance of Terms",
        paragraphs: [
          "By using the website or app or submitting an enquiry, you confirm that you accept these Terms of Use. If you do not agree, do not use the services or submit a request. If you act for a team, company, academy, group, or other organization, you represent that you are authorized to do so."
        ]
      },
      {
        heading: "3. Eligibility and Proper Use",
        paragraphs: [
          "You agree to use the website and app only for lawful purposes and in a way that does not violate any applicable law or regulation, infringe the rights of others, interfere with normal operation, attempt unauthorized access to the admin area, introduce malicious code or harmful material, submit false, misleading, abusive, or fraudulent information, or misuse forms, bookings, registrations, or contact channels."
        ]
      },
      {
        heading: "4. Informational Nature of Content",
        paragraphs: [
          "Content in the website and app is provided for general information only. While we aim to keep it accurate and up to date, we do not guarantee that all information is complete, current, error-free, or always available.",
          "This includes tournament details, schedules, fixtures, availability, venue descriptions, facility information, contact details, images, promotional content, and booking-related information. Final booking terms, venue availability, event details, and operational decisions may need to be confirmed directly with Hamriyah Cricket Centre."
        ]
      },
      {
        heading: "5. No Guaranteed Booking or Registration",
        paragraphs: [
          "Submitting a form, enquiry, or tournament interest through the website or app does not automatically create a confirmed booking, reservation, or participation right. A booking, reservation, or registration is only final when confirmed directly by Hamriyah Cricket Centre through its official communication process.",
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
          "Unless otherwise stated, the website, app, and their contents, including text, design, layout, branding, logos, graphics, photographs, video, media, and original written content, are owned by or licensed to Hamriyah Cricket Centre.",
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
          "The admin panel and administrative functions are restricted to authorized personnel only. You must not attempt to access, probe, bypass, disrupt, reverse engineer, or interfere with any restricted area, login system, security measure, app service, or backend function."
        ]
      },
      {
        heading: "10. Third-Party Services and Links",
        paragraphs: [
          "The website or app may integrate with or open third-party tools, platforms, maps, social media pages, media services, communication services, or data infrastructure providers. We do not control third-party services and are not responsible for their availability, policies, security, content, or performance."
        ]
      },
      {
        heading: "11. Disclaimer of Warranties",
        paragraphs: [
          "To the maximum extent permitted by applicable law, the website and app are provided on an \"as is\" and \"as available\" basis. We do not make warranties or representations, express or implied, regarding availability, uninterrupted or error-free operation, completeness or accuracy of content, suitability for a particular purpose, or absence of bugs, security incidents, or technical issues."
        ]
      },
      {
        heading: "12. Limitation of Liability",
        paragraphs: [
          "To the fullest extent permitted by law, Hamriyah Cricket Centre shall not be liable for any indirect, incidental, consequential, special, or business-related loss arising out of or connected with use of or inability to use the website or app, reliance on unconfirmed content, booking misunderstandings not yet confirmed by us, tournament changes or cancellations, technical errors, outages, delays, interruptions, unauthorized access by third parties, or external services. Nothing in these terms limits liability that cannot legally be limited."
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
          "Your use of the website and app is also subject to our Privacy Policy, which explains how we collect, use, disclose, retain, and protect personal information."
        ]
      },
      {
        heading: "15. Suspension or Termination",
        paragraphs: [
          "We may restrict, suspend, block, or terminate access to all or part of the website, app, or related services at any time, with or without notice, particularly where we believe there is misuse, technical risk, unauthorized activity, or a security concern."
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
      <p>Effective Date: 15 July 2026</p>
      ${sections.map((section) => `
        <section>
          <h2>${section.heading}</h2>
          ${section.paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("")}
        </section>
      `).join("")}
      <p class="updated">Last updated: 15 July 2026</p>
    </div>
  </main>
</body>
</html>`);
}

async function handleRequest(request, response) {
  try {
    initializeRuntime();
    const parsed = new URL(request.url, `http://localhost:${PORT}`);
    const pathname = resolveRequestPath(parsed);

    if (!checkRateLimit(request, "global", 600, 60 * 1000)) {
      sendJson(response, 429, { error: "Too many requests" });
      return;
    }

    if (!isSameOriginWrite(request)) {
      sendJson(response, 403, { error: "Cross-site request blocked" });
      return;
    }

    if (pathname === "/health" && request.method === "GET") {
      const readinessIssues = getProductionReadinessIssues();
      sendJson(response, readinessIssues.length ? 503 : 200, {
        ok: readinessIssues.length === 0,
        ready: readinessIssues.length === 0
      });
      return;
    }

    if (pathname === "/robots.txt" && request.method === "GET") {
      sendRobots(request, response);
      return;
    }

    if (pathname === "/sitemap.xml" && request.method === "GET") {
      sendSitemap(request, response);
      return;
    }

    if (pathname === "/booking-status" && request.method === "GET") {
      sendBookingStatusPage(response);
      return;
    }

    if (pathname === "/booking-confirmation" && request.method === "GET") {
      sendBookingConfirmationPage(response);
      return;
    }

    if (pathname === "/privacy" && request.method === "GET") {
      sendLegalPage(response, "privacy");
      return;
    }

    if (pathname === "/terms" && request.method === "GET") {
      sendLegalPage(response, "terms");
      return;
    }

    if (pathname === "/login" && request.method === "GET") {
      sendLoginPage(response);
      return;
    }

    if (pathname === "/login" && request.method === "POST") {
      if (!isSameOriginWrite(request, { requireHeader: true })) {
        sendJson(response, 403, { error: "Cross-site request blocked" });
        return;
      }
      await handleLogin(request, response);
      return;
    }

    if (pathname === "/mfa" && request.method === "GET") {
      const pending = getPendingMfaSession(request);
      if (!pending) redirectToLogin(response);
      else sendMfaPage(response, pending);
      return;
    }

    if (pathname === "/mfa/enroll" && request.method === "POST") {
      if (!isSameOriginWrite(request, { requireHeader: true })) {
        sendJson(response, 403, { error: "Cross-site request blocked" });
        return;
      }
      const pending = getPendingMfaSession(request);
      const allowed = pending && await checkSharedRateLimit(request, "mfa-enroll", 4, 60 * 60 * 1000, pending.identity);
      if (!allowed) {
        sendJson(response, 429, { error: "Too many enrollment attempts" });
        return;
      }
      await handleMfaEnroll(request, response);
      return;
    }

    if (pathname === "/mfa/verify" && request.method === "POST") {
      if (!isSameOriginWrite(request, { requireHeader: true })) {
        sendJson(response, 403, { error: "Cross-site request blocked" });
        return;
      }
      await handleMfaVerify(request, response);
      return;
    }

    if (pathname === "/reset-request" && request.method === "GET") {
      sendResetRequestPage(response);
      return;
    }

    if (pathname === "/reset-request" && request.method === "POST") {
      if (!isSameOriginWrite(request, { requireHeader: true })) {
        sendJson(response, 403, { error: "Cross-site request blocked" });
        return;
      }
      const params = new URLSearchParams(await readBody(request, { maxBytes: MAX_FORM_BYTES, allowedTypes: ["application/x-www-form-urlencoded"] }));
      const email = String(params.get("email") || "").trim().toLowerCase();
      const ipAllowed = await checkSharedRateLimit(request, "password-reset-ip", 5, 60 * 60 * 1000);
      const accountAllowed = await checkSharedRateLimit(request, "password-reset-account", 5, 60 * 60 * 1000, email);
      if (!ipAllowed || !accountAllowed) {
        sendResetRequestPage(response, "Too many reset requests. Please try again later.", true);
        return;
      }
      try {
        await sendSupabasePasswordReset(email, request);
      } catch (error) {
        console.error("Password reset request failed:", error.message || error);
      }
      sendResetRequestPage(response, "If that email is allowed, a reset link has been sent.");
      return;
    }

    if (pathname === "/reset-password" && request.method === "GET") {
      sendResetPasswordPage(response);
      return;
    }

    if (pathname === "/logout" && request.method !== "POST") {
      sendJson(response, 405, { error: "Method not allowed" }, { Allow: "POST" });
      return;
    }

    const protectedRoute = requiresAdminAuth(pathname, request.method);
    if (protectedRoute && !(await isAuthorized(request))) {
      if (pathname.startsWith("/api/")) sendUnauthorizedJson(response);
      else redirectToLogin(response);
      return;
    }

    if (protectedRoute && new Set(["POST", "PUT", "PATCH", "DELETE"]).has(request.method)) {
      if (!isSameOriginWrite(request, { requireHeader: true }) || !hasValidCsrfToken(request)) {
        sendJson(response, 403, { error: "Invalid CSRF token" });
        return;
      }
    }

    if (pathname === "/logout" && request.method === "POST") {
      await handleLogout(request, response);
      return;
    }

    if (pathname === "/api/content" && request.method === "GET") {
      const content = await readContent();
      const authenticated = await isAuthorized(request);
      sendJson(response, 200, authenticated ? content : projectPublicContent(content), authenticated ? {} : {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300"
      });
      return;
    }

    if (pathname === "/api/session" && request.method === "GET") {
      const session = request.hccSession;
      sendJson(response, 200, {
        identity: session?.identity || ADMIN_USER,
        provider: session?.provider || "basic",
        csrfToken: session?.csrfToken || "",
        mfa: session?.aal === "aal2",
        contentStorage: hasSupabaseConfig() ? "supabase" : "local-json",
        bookingStorage: hasSupabaseConfig() ? "supabase" : "local-json",
        bookingRetentionDays: BOOKING_RETENTION_DAYS,
        imageStorage: hasCloudinaryConfig() ? "cloudinary" : "local-data",
        auth: authMode(),
        forms: FORMSPREE_ENDPOINT ? "configured" : "missing"
      });
      return;
    }

    if (pathname === "/api/audit" && request.method === "GET") {
      sendJson(response, 200, { entries: await readAuditLog() });
      return;
    }

    if (pathname === "/api/audit" && request.method === "DELETE") {
      clearAuditLog();
      await logAudit(request, "audit.clear");
      sendJson(response, 200, { ok: true });
      return;
    }

    if (pathname === "/api/bookings" && request.method === "GET") {
      sendJson(response, 200, { bookings: await readBookings() });
      return;
    }

    if (pathname === "/api/booking-status" && request.method === "POST") {
      const payload = await readJsonBody(request, 8 * 1024);
      const reference = String(payload.reference || "").trim().toUpperCase();
      const email = String(payload.email || "").trim().toLowerCase();
      if (!/^HCC-\d{8}-[A-Z0-9]{6,12}$/.test(reference) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        throw new ValidationError("Enter a valid booking reference and email address.");
      }
      const ipAllowed = await checkSharedRateLimit(request, "booking-status-ip", 12, 15 * 60 * 1000);
      const subjectAllowed = await checkSharedRateLimit(request, "booking-status-subject", 12, 15 * 60 * 1000, `${reference}:${email}`);
      if (!ipAllowed || !subjectAllowed) {
        sendJson(response, 429, { error: "Too many status checks. Please try again later." });
        return;
      }
      const booking = await findBookingForCustomer(reference, email);
      if (!booking) {
        sendJson(response, 404, { error: "No matching booking was found." });
        return;
      }
      sendJson(response, 200, booking);
      return;
    }

    if (pathname.startsWith("/api/bookings/") && request.method === "PATCH") {
      if (!checkRateLimit(request, "booking-update", 120, 60 * 1000)) {
        sendJson(response, 429, { error: "Too many booking updates" });
        return;
      }
      const reference = pathname.slice("/api/bookings/".length);
      if (!/^HCC-\d{8}-[A-Z0-9]{6,12}$/.test(reference)) {
        sendJson(response, 400, { error: "Invalid booking reference" });
        return;
      }
      const changes = await readJsonBody(request, 16 * 1024);
      const booking = await updateBooking(reference, changes);
      await logAudit(request, "booking.update", { reference, status: booking.status });
      sendJson(response, 200, booking);
      return;
    }

    if (pathname.startsWith("/api/bookings/") && request.method === "DELETE") {
      if (!checkRateLimit(request, "booking-delete", 30, 60 * 1000)) {
        sendJson(response, 429, { error: "Too many booking deletions" });
        return;
      }
      const reference = pathname.slice("/api/bookings/".length);
      if (!/^HCC-\d{8}-[A-Z0-9]{6,12}$/.test(reference)) {
        sendJson(response, 400, { error: "Invalid booking reference" });
        return;
      }
      await deleteBooking(reference);
      await logAudit(request, "booking.delete", { reference });
      sendJson(response, 200, { ok: true, reference });
      return;
    }

    if (pathname === "/api/content" && request.method === "POST") {
      if (!checkRateLimit(request, "content-write", 80, 60 * 1000)) {
        sendJson(response, 429, { error: "Too many save requests" });
        return;
      }
      const payload = await readJsonBody(request, MAX_CONTENT_BYTES);
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

    if (pathname === "/api/upload" && request.method === "POST") {
      if (!checkRateLimit(request, "upload", 30, 60 * 1000)) {
        sendJson(response, 429, { error: "Too many upload requests" });
        return;
      }
      const payload = await readJsonBody(request, MAX_UPLOAD_BODY_BYTES);
      const uploaded = await uploadImageToCloudinary(payload);
      await logAudit(request, "image.upload", {
        provider: uploaded.provider,
        context: payload.context || "uploads",
        publicId: uploaded.publicId || ""
      });
      sendJson(response, 200, uploaded);
      return;
    }

    if (pathname === "/api/cloudinary/delete" && request.method === "POST") {
      if (!checkRateLimit(request, "cloudinary-delete", 40, 60 * 1000)) {
        sendJson(response, 429, { error: "Too many delete requests" });
        return;
      }
      const payload = await readJsonBody(request, 4 * 1024);
      const deleted = await deleteCloudinaryImage(payload.publicId);
      await logAudit(request, "image.delete", { publicId: payload.publicId || "", result: deleted.result || "skipped" });
      sendJson(response, 200, deleted);
      return;
    }

    if (pathname === "/api/password-reset" && request.method === "POST") {
      if (!checkRateLimit(request, "password-reset-admin", 5, 60 * 60 * 1000)) {
        sendJson(response, 429, { error: "Too many reset requests" });
        return;
      }
      const payload = await readJsonBody(request, 8 * 1024);
      const reset = await sendSupabasePasswordReset(payload.email, request);
      await logAudit(request, "password.reset.request", { email: String(payload.email || "").trim().toLowerCase() });
      sendJson(response, 200, reset);
      return;
    }

    if (pathname === "/api/password-update" && request.method === "POST") {
      if (!checkRateLimit(request, "password-update", 8, 15 * 60 * 1000)) {
        sendJson(response, 429, { error: "Too many password update requests" });
        return;
      }
      const session = request.hccSession;
      if (!session || session.provider !== "supabase") {
        sendJson(response, 400, { error: "Password changes are available for Supabase admin accounts. Configure ADMIN_PASSWORD only if you intentionally enable local admin." });
        return;
      }
      const payload = await readJsonBody(request, 8 * 1024);
      const updated = await updateSupabasePasswordWithSession(session, payload.currentPassword, payload.newPassword);
      await logAudit(request, "password.update", { identity: session.identity });
      sendJson(response, 200, { ...updated, reauthenticate: true }, {
        "Set-Cookie": [clearCookie(SESSION_COOKIE), clearCookie(MFA_PENDING_COOKIE)]
      });
      return;
    }

    if (pathname === "/api/password-update-token" && request.method === "POST") {
      if (!(await checkSharedRateLimit(request, "password-update-token", 8, 15 * 60 * 1000))) {
        sendJson(response, 429, { error: "Too many password update requests" });
        return;
      }
      const payload = await readJsonBody(request, 24 * 1024);
      sendJson(response, 200, await updateSupabasePasswordFromRecovery(payload.accessToken, payload.newPassword, payload.mfaCode));
      return;
    }

    if (pathname === "/api/form-submit" && request.method === "POST") {
      if (!checkRateLimit(request, "form-submit-ip", 20, 60 * 1000)) {
        sendJson(response, 429, { error: "Too many form submissions" });
        return;
      }
      const payload = await readJsonBody(request, 32 * 1024);
      const sharedAllowed = await checkSharedRateLimit(request, "form-submit-subject", 20, 60 * 1000, payload.email || payload.phone || "");
      if (!sharedAllowed) {
        sendJson(response, 429, { error: "Too many form submissions" });
        return;
      }
      const result = await forwardFormSubmission(payload);
      sendJson(response, result.deliveryStatus === "failed" ? 202 : 200, result);
      return;
    }

    serveFile(pathname, response, { protectedAsset: requiresAdminAuth(pathname, request.method) });
  } catch (error) {
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    if (status >= 500) console.error(error);
    const message = status >= 500 && IS_PRODUCTION ? "The service is temporarily unavailable." : (error.message || "Server error");
    sendJson(response, status, { error: message });
  }
}

const server = http.createServer(handleRequest);

server.requestTimeout = 15 * 1000;
server.headersTimeout = 10 * 1000;
server.keepAliveTimeout = 5 * 1000;
server.maxRequestsPerSocket = 100;

if (require.main === module && !IS_VERCEL) {
  initializeRuntime();
  ensureContentFile();
  startMaintenanceJobs();
  server.listen(PORT, () => {
    console.log(`HCC website running at http://localhost:${PORT}/`);
    console.log(`Admin panel available at http://localhost:${PORT}/admin`);
    console.log(`Content storage: ${hasSupabaseConfig() ? "Supabase" : "local JSON fallback"}`);
    console.log(`Image storage: ${hasCloudinaryConfig() ? "Cloudinary" : "local data fallback"}`);
    console.log(`Forms: ${FORMSPREE_ENDPOINT ? "Formspree proxy" : "not configured"}`);
    console.log(`Local admin fallback: ${localAdminEnabled() ? "enabled" : "disabled"}`);
  });
}

module.exports = handleRequest;
module.exports.handleRequest = handleRequest;
