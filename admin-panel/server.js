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
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_CONTENT_TABLE = process.env.SUPABASE_CONTENT_TABLE || "hcc_site_content";
const CONTENT_RECORD_ID = process.env.CONTENT_RECORD_ID || "main";
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "";
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "";
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "";
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "hcc-website";

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
    tournaments: Array.isArray(content.tournaments) ? content.tournaments : [],
    images: Array.isArray(content.images) ? content.images : [],
    socials: Array.isArray(content.socials) ? content.socials : [],
    testimonials: Array.isArray(content.testimonials) ? content.testimonials : []
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
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
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
  const cookie = parseCookies(request)[SESSION_COOKIE];
  if (!cookie) return false;
  const separator = cookie.indexOf(".");
  if (separator === -1) return false;
  const user = cookie.slice(0, separator);
  const signature = cookie.slice(separator + 1);
  return timingSafeEqual(user, ADMIN_USER) && timingSafeEqual(signature, signSession(user));
}

function isAuthorized(request) {
  return isCookieAuthorized(request) || isBasicAuthorized(request);
}

function redirectToLogin(response) {
  response.writeHead(302, {
    Location: "/login",
    "Cache-Control": "no-store"
  });
  response.end();
}

function sendUnauthorizedJson(response) {
  sendJson(response, 401, { error: "Authentication required" });
}

function sendLoginPage(response, errorMessage = "") {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
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
    a { display:inline-block; margin-top:18px; color:var(--green); font-weight:700; }
  </style>
</head>
<body>
  <main>
    <img src="/logo.png" alt="HCC logo">
    <h1>Admin Login</h1>
    <p>Sign in to manage tournaments, images, socials, and testimonials.</p>
    <form method="POST" action="/login">
      <label>Username<input name="username" autocomplete="username" required></label>
      <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
      <button type="submit">Sign in</button>
    </form>
    ${errorMessage ? `<div class="error">${errorMessage}</div>` : ""}
    <a href="/">View website</a>
  </main>
</body>
</html>`);
}

async function handleLogin(request, response) {
  const body = await readBody(request);
  const params = new URLSearchParams(body);
  const username = params.get("username") || "";
  const password = params.get("password") || "";

  if (timingSafeEqual(username, ADMIN_USER) && timingSafeEqual(password, ADMIN_PASSWORD)) {
    const value = `${ADMIN_USER}.${signSession(ADMIN_USER)}`;
    response.writeHead(302, {
      Location: "/admin",
      "Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(value)}; HttpOnly; Path=/; SameSite=Lax`,
      "Cache-Control": "no-store"
    });
    response.end();
    return;
  }

  sendLoginPage(response, "Invalid username or password.");
}

function handleLogout(response) {
  response.writeHead(302, {
    Location: "/login",
    "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
    "Cache-Control": "no-store"
  });
  response.end();
}

function requiresAdminAuth(request) {
  const parsed = new URL(request.url, `http://localhost:${PORT}`);
  const pathname = parsed.pathname;

  if (pathname === "/api/content" && request.method !== "GET") return true;
  if (pathname === "/api/upload") return true;
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
      if (body.length > 30 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function serveFile(requestUrl, response) {
  const parsed = new URL(requestUrl, `http://localhost:${PORT}`);
  let routePath = parsed.pathname;
  if (routePath === "/") routePath = "/site.html";
  if (routePath === "/admin") routePath = "/index.html";
  const pathname = decodeURIComponent(routePath);
  const safePath = path.normalize(path.join(ROOT, pathname));

  if (!safePath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(safePath, (error, file) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(safePath).toLowerCase()] || "application/octet-stream"
    });
    response.end(file);
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const parsed = new URL(request.url, `http://localhost:${PORT}`);

    if (parsed.pathname === "/login" && request.method === "GET") {
      sendLoginPage(response);
      return;
    }

    if (parsed.pathname === "/login" && request.method === "POST") {
      await handleLogin(request, response);
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

    if (request.url === "/api/content" && request.method === "POST") {
      const payload = JSON.parse(await readBody(request));
      sendJson(response, 200, await writeContent(payload));
      return;
    }

    if (request.url === "/api/upload" && request.method === "POST") {
      const payload = JSON.parse(await readBody(request));
      sendJson(response, 200, await uploadImageToCloudinary(payload));
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
});
