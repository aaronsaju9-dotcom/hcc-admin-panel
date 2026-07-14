const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");

const ROOT = __dirname;
const HOST = "127.0.0.1";

async function waitForServer(origin) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${origin}/health`);
      if (response.ok) return;
    } catch {
      // The child process may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Test server did not start.");
}

async function withServer(env, callback) {
  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let errors = "";
  child.stderr.on("data", (chunk) => { errors += chunk; });
  const origin = `http://${HOST}:${env.PORT}`;

  try {
    await waitForServer(origin);
    await callback(origin);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      child.once("exit", resolve);
      setTimeout(resolve, 1000);
    });
  }

  if (errors.trim()) throw new Error(errors.trim());
}

async function request(origin, pathname, options = {}) {
  return fetch(`${origin}${pathname}`, { redirect: "manual", ...options });
}

async function checkHardenedProduction() {
  const port = String(19000 + (process.pid % 1000));
  await withServer({
    PORT: port,
    NODE_ENV: "production",
    TRUST_PROXY: "false",
    PUBLIC_ORIGIN: `http://${HOST}:${port}`,
    SUPABASE_AUTH_ENABLED: "true",
    SUPABASE_URL: "",
    SUPABASE_ANON_KEY: "",
    ALLOW_LOCAL_ADMIN: "false",
    ADMIN_USER: "admin",
    ADMIN_PASSWORD: "change-this-password",
    SESSION_SECRET: "security-check-session-secret"
  }, async (origin) => {
    const home = await request(origin, "/");
    assert.equal(home.status, 200);
    assert.match(home.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
    assert.equal(home.headers.get("x-frame-options"), "DENY");
    assert.equal((await request(origin, "/logo.webp")).status, 200);
    assert.equal((await request(origin, "/api/content")).status, 200);

    for (const pathname of ["/server.js", "/package.json", "/README.md", "/supabase-schema.sql", "/data/content.json", "/.env"]) {
      assert.equal((await request(origin, pathname)).status, 404, `${pathname} must not be public`);
    }

    assert.equal((await request(origin, "/admin")).status, 302);
    assert.equal((await request(origin, "/api/audit")).status, 401);
    assert.equal((await request(origin, "/api/bookings")).status, 401);

    const crossSite = await request(origin, "/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://attacker.example",
        "Sec-Fetch-Site": "cross-site"
      },
      body: "username=admin&password=change-this-password"
    });
    assert.equal(crossSite.status, 403);

    const fallbackLogin = await request(origin, "/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: origin
      },
      body: "username=admin&password=change-this-password"
    });
    assert.equal(fallbackLogin.status, 200);
    assert.equal(fallbackLogin.headers.get("set-cookie"), null);

    const honeypot = await request(origin, "/api/form-submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ website: "https://spam.example" })
    });
    assert.equal(honeypot.status, 200);

    const invalidBooking = await request(origin, "/api/form-submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({
        form_type: "Slot Booking",
        fullname: "Test User",
        phone: "not-a-phone",
        booking_date: "2026-07-20"
      })
    });
    assert.equal(invalidBooking.status, 400);

    const sitemap = await request(origin, "/sitemap.xml", {
      headers: { Host: "attacker.example" }
    });
    assert.match(await sitemap.text(), new RegExp(`http://${HOST}:${port}`));
  });
}

async function checkExpiringLocalSession() {
  const port = String(20000 + (process.pid % 1000));
  await withServer({
    PORT: port,
    NODE_ENV: "production",
    TRUST_PROXY: "false",
    PUBLIC_ORIGIN: `http://${HOST}:${port}`,
    SUPABASE_AUTH_ENABLED: "false",
    ADMIN_SESSION_HOURS: "1",
    ADMIN_USER: "local-owner",
    ADMIN_PASSWORD: "strong-local-password",
    SESSION_SECRET: "another-security-check-secret"
  }, async (origin) => {
    const login = await request(origin, "/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: origin
      },
      body: "username=local-owner&password=strong-local-password"
    });
    assert.equal(login.status, 302);
    const cookie = login.headers.get("set-cookie") || "";
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /Max-Age=3600/);

    const cookieValue = decodeURIComponent(cookie.split(";", 1)[0].split("=", 2)[1]);
    const payload = cookieValue.slice(0, cookieValue.indexOf("."));
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    assert.equal(session.expiresAt - session.issuedAt, 60 * 60 * 1000);

    const admin = await request(origin, "/admin", { headers: { Cookie: cookie.split(";", 1)[0] } });
    assert.equal(admin.status, 200);
    const bookings = await request(origin, "/api/bookings", { headers: { Cookie: cookie.split(";", 1)[0] } });
    assert.equal(bookings.status, 200);
    assert.deepEqual((await bookings.json()).bookings, []);
  });
}

async function main() {
  await checkHardenedProduction();
  await checkExpiringLocalSession();
  console.log("Security checks passed.");
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
