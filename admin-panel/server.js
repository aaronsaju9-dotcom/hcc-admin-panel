const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 8765);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const CONTENT_FILE = path.join(DATA_DIR, "content.json");
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-this-password";
const SESSION_SECRET = process.env.SESSION_SECRET || ADMIN_PASSWORD;
const SESSION_COOKIE = "hcc_admin_session";
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_CONTENT_TABLE = process.env.SUPABASE_CONTENT_TABLE || "hcc_site_content";
const CONTENT_RECORD_ID = process.env.CONTENT_RECORD_ID || "main";
const SUPABASE_AUTH_ENABLED = process.env.SUPABASE_AUTH_ENABLED === "true";
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "";
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "";
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "";
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "hcc-website";
const FORMSPREE_ENDPOINT = process.env.FORMSPREE_ENDPOINT || "";
const TRUST_PROXY = process.env.TRUST_PROXY === "true";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const MAX_JSON_BYTES = 30 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const rateLimits = new Map();

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
  return {
    "X-Content-Type-Options": "nosniff",
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

function sendJson(response, status, payload) {
  response.writeHead(status, {
    ...commonHeaders({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    })
  });
  response.end(JSON.stringify(payload, null, 2));
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
  if (!FORMSPREE_ENDPOINT) {
    throw new Error("Form endpoint is not configured.");
  }

  const response = await fetch(FORMSPREE_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || result.message || "Form submission failed.");
  }
  return { ok: true };
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return require("crypto").timingSafeEqual(left, right);
}

function signSession(value) {
  return require("crypto")
    .createHmac("sha256", SESSION_SECRET)
    .update(value)
    .digest("hex");
}

function makeSessionValue(identity) {
  return `${identity}.${signSession(identity)}`;
}

function makeSessionObjectValue(session) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${signSession(payload)}`;
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
      const allowedIdentity = identity === ADMIN_USER || (ADMIN_EMAILS.length > 0 && ADMIN_EMAILS.includes(identity.toLowerCase()));
      return allowedIdentity ? session : null;
    } catch {
      const identity = payload;
      const allowedIdentity = identity === ADMIN_USER || (ADMIN_EMAILS.length > 0 && ADMIN_EMAILS.includes(identity.toLowerCase()));
      return allowedIdentity ? { identity, provider: identity === ADMIN_USER ? "local" : "supabase" } : null;
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
    <img src="/logo.png" alt="HCC logo">
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
  const fallbackIdentity = timingSafeEqual(username, ADMIN_USER) && timingSafeEqual(password, ADMIN_PASSWORD)
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
        "Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(value)}; HttpOnly; Path=/; SameSite=Lax${IS_PRODUCTION ? "; Secure" : ""}`,
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
  if (pathname === "/api/password-reset") return true;
  if (pathname === "/api/password-update") return true;
  return pathname === "/admin" ||
    pathname === "/index.html" ||
    pathname === "/admin.css" ||
    pathname === "/admin.js";
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_JSON_BYTES) {
        reject(new Error("Request body too large"));
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
    <img src="/logo.png" alt="HCC logo">
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

  const redirectTo = `${getOrigin(request)}/reset-password`;
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
    <img src="/logo.png" alt="HCC logo">
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
  const safePath = path.normalize(path.join(ROOT, pathname));

  if (!safePath.startsWith(ROOT)) {
    response.writeHead(403, commonHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
    response.end("Forbidden");
    return;
  }

  fs.readFile(safePath, (error, file) => {
    if (error) {
      response.writeHead(404, commonHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      ...commonHeaders({
        "Content-Type": mimeTypes[path.extname(safePath).toLowerCase()] || "application/octet-stream"
      })
    });
    response.end(file);
  });
}

function sendRobots(request, response) {
  const origin = getOrigin(request);
  response.writeHead(200, commonHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
  response.end(`User-agent: *\nDisallow: /admin\nDisallow: /login\nSitemap: ${origin}/sitemap.xml\n`);
}

function sendSitemap(request, response) {
  const origin = getOrigin(request);
  response.writeHead(200, commonHeaders({ "Content-Type": "application/xml; charset=utf-8" }));
  response.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${origin}/</loc><priority>1.0</priority></url>\n</urlset>\n`);
}

function getOrigin(request) {
  const protocol = TRUST_PROXY && request.headers["x-forwarded-proto"] ? request.headers["x-forwarded-proto"] : "http";
  return `${protocol}://${request.headers.host || `localhost:${PORT}`}`;
}

const server = http.createServer(async (request, response) => {
  try {
    const parsed = new URL(request.url, `http://localhost:${PORT}`);

    if (!checkRateLimit(request, "global", 600, 60 * 1000)) {
      sendJson(response, 429, { error: "Too many requests" });
      return;
    }

    if (parsed.pathname === "/health") {
      sendJson(response, 200, {
        ok: true,
        contentStorage: hasSupabaseConfig() ? "supabase" : "local-json",
        imageStorage: hasCloudinaryConfig() ? "cloudinary" : "local-data",
        auth: hasSupabaseAuthConfig() ? "supabase-auth" : "local-admin",
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
      sendJson(response, 200, await readContent());
      return;
    }

    if (request.url === "/api/session" && request.method === "GET") {
      const session = getSession(request);
      sendJson(response, 200, {
        identity: session?.identity || ADMIN_USER,
        provider: session?.provider || "basic",
        contentStorage: hasSupabaseConfig() ? "supabase" : "local-json",
        imageStorage: hasCloudinaryConfig() ? "cloudinary" : "local-data",
        auth: hasSupabaseAuthConfig() ? "supabase-auth" : "local-admin",
        forms: FORMSPREE_ENDPOINT ? "configured" : "missing"
      });
      return;
    }

    if (request.url === "/api/content" && request.method === "POST") {
      if (!checkRateLimit(request, "content-write", 80, 60 * 1000)) {
        sendJson(response, 429, { error: "Too many save requests" });
        return;
      }
      const payload = JSON.parse(await readBody(request));
      sendJson(response, 200, await writeContent(payload));
      return;
    }

    if (request.url === "/api/upload" && request.method === "POST") {
      if (!checkRateLimit(request, "upload", 30, 60 * 1000)) {
        sendJson(response, 429, { error: "Too many upload requests" });
        return;
      }
      const payload = JSON.parse(await readBody(request));
      sendJson(response, 200, await uploadImageToCloudinary(payload));
      return;
    }

    if (request.url === "/api/cloudinary/delete" && request.method === "POST") {
      if (!checkRateLimit(request, "cloudinary-delete", 40, 60 * 1000)) {
        sendJson(response, 429, { error: "Too many delete requests" });
        return;
      }
      const payload = JSON.parse(await readBody(request));
      sendJson(response, 200, await deleteCloudinaryImage(payload.publicId));
      return;
    }

    if (request.url === "/api/password-reset" && request.method === "POST") {
      if (!checkRateLimit(request, "password-reset-admin", 5, 60 * 60 * 1000)) {
        sendJson(response, 429, { error: "Too many reset requests" });
        return;
      }
      const payload = JSON.parse(await readBody(request));
      sendJson(response, 200, await sendSupabasePasswordReset(payload.email, request));
      return;
    }

    if (request.url === "/api/password-update" && request.method === "POST") {
      if (!checkRateLimit(request, "password-update", 8, 15 * 60 * 1000)) {
        sendJson(response, 429, { error: "Too many password update requests" });
        return;
      }
      const session = getSession(request);
      if (!session || session.provider !== "supabase") {
        sendJson(response, 400, { error: "Password changes are available for Supabase admin accounts. Change fallback ADMIN_PASSWORD in Render env." });
        return;
      }
      const payload = JSON.parse(await readBody(request));
      sendJson(response, 200, await updateSupabasePasswordWithLogin(session.identity, payload.currentPassword, payload.newPassword));
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
      const payload = JSON.parse(await readBody(request));
      sendJson(response, 200, await forwardFormSubmission(payload));
      return;
    }

    serveFile(request.url, response);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Server error" });
  }
});

ensureContentFile();
server.listen(PORT, () => {
  console.log(`HCC website running at http://localhost:${PORT}/`);
  console.log(`Admin panel available at http://localhost:${PORT}/admin`);
  console.log(`Content storage: ${hasSupabaseConfig() ? "Supabase" : "local JSON fallback"}`);
  console.log(`Image storage: ${hasCloudinaryConfig() ? "Cloudinary" : "local data fallback"}`);
  console.log(`Forms: ${FORMSPREE_ENDPOINT ? "Formspree proxy" : "not configured"}`);
});
