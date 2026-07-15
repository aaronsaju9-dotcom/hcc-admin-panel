const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const ROOT = __dirname;
const HOST = "127.0.0.1";
const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "hcc-security-"));

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
    env: { ...process.env, HCC_DATA_DIR: TEST_DATA_DIR, ...env },
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

async function withFakeFormspree(callback) {
  const submissions = [];
  const server = http.createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const submission = JSON.parse(body || "{}");
    submissions.push(submission);
    const rejected = submission.fullname === "Delivery Failure Test";
    response.writeHead(rejected ? 503 : 200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(rejected ? { error: "Simulated delivery failure" } : { ok: true }));
  });
  await new Promise((resolve) => server.listen(0, HOST, resolve));
  const address = server.address();
  const origin = `http://${HOST}:${address.port}`;
  try {
    await callback(`${origin}/f/test`, submissions);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
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
    const bookingStatusPage = await request(origin, "/booking-status");
    assert.equal(bookingStatusPage.status, 200);
    assert.match(await bookingStatusPage.text(), /id="status-form"/);

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

    const missingEmail = await request(origin, "/api/form-submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({
        form_type: "Slot Booking",
        fullname: "Test User",
        phone: "+971 50 123 4567",
        booking_date: "2026-07-20"
      })
    });
    assert.equal(missingEmail.status, 400);

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

async function checkBookingLifecycle() {
  const port = String(21000 + (process.pid % 1000));
  await withFakeFormspree(async (formspreeEndpoint, submissions) => {
    await withServer({
      PORT: port,
      NODE_ENV: "production",
      TRUST_PROXY: "false",
      PUBLIC_ORIGIN: `http://${HOST}:${port}`,
      SUPABASE_AUTH_ENABLED: "false",
      SUPABASE_URL: "",
      SUPABASE_ANON_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      ADMIN_USER: "booking-owner",
      ADMIN_PASSWORD: "strong-booking-password",
      SESSION_SECRET: "booking-lifecycle-session-secret",
      FORMSPREE_ENDPOINT: formspreeEndpoint,
      BOOKING_RETENTION_DAYS: "0"
    }, async (origin) => {
      const submitted = await request(origin, "/api/form-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({
          form_type: "Slot Booking",
          fullname: "Security Test User",
          email: "Security.Test@Example.com",
          phone: "+971 50 123 4567",
          booking_type: "Full Ground",
          booking_date: "2026-07-20",
          booking_date_label: "20 July 2026",
          time_slot: "7:00 PM - 9:00 PM"
        })
      });
      assert.equal(submitted.status, 200);
      const submittedBody = await submitted.json();
      assert.match(submittedBody.reference, /^HCC-\d{8}-[A-F0-9]{8}$/);
      const reference = submittedBody.reference;
      assert.equal(submissions.length, 1);
      assert.equal(submissions[0].booking_reference, reference);

      const wrongEmail = await request(origin, "/api/booking-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, email: "wrong@example.com" })
      });
      assert.equal(wrongEmail.status, 404);

      const initialStatus = await request(origin, "/api/booking-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, email: "security.test@example.com" })
      });
      assert.equal(initialStatus.status, 200);
      const initialPublicBooking = await initialStatus.json();
      assert.equal(initialPublicBooking.status, "new");
      for (const privateField of ["email", "phone", "fullname", "notes", "admin_note", "delivery_status"]) {
        assert.equal(Object.hasOwn(initialPublicBooking, privateField), false, `${privateField} must remain private`);
      }

      const unauthenticatedDelete = await request(origin, `/api/bookings/${reference}`, { method: "DELETE" });
      assert.equal(unauthenticatedDelete.status, 401);

      const login = await request(origin, "/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin },
        body: "username=booking-owner&password=strong-booking-password"
      });
      assert.equal(login.status, 302);
      const cookie = (login.headers.get("set-cookie") || "").split(";", 1)[0];
      assert.ok(cookie);

      const bookingList = await request(origin, "/api/bookings", { headers: { Cookie: cookie } });
      assert.equal(bookingList.status, 200);
      const savedBooking = (await bookingList.json()).bookings.find((booking) => booking.reference === reference);
      assert.equal(savedBooking.email, "security.test@example.com");
      assert.equal(savedBooking.delivery_status, "sent");

      const updated = await request(origin, `/api/bookings/${reference}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
        body: JSON.stringify({ status: "confirmed", admin_note: "Private staff note" })
      });
      assert.equal(updated.status, 200);

      const confirmedStatus = await request(origin, "/api/booking-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, email: "security.test@example.com" })
      });
      assert.equal(confirmedStatus.status, 200);
      const confirmedPublicBooking = await confirmedStatus.json();
      assert.equal(confirmedPublicBooking.status, "confirmed");
      assert.equal(Object.hasOwn(confirmedPublicBooking, "admin_note"), false);

      const deleted = await request(origin, `/api/bookings/${reference}`, {
        method: "DELETE",
        headers: { Cookie: cookie, Origin: origin }
      });
      assert.equal(deleted.status, 200);

      const deletedStatus = await request(origin, "/api/booking-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, email: "security.test@example.com" })
      });
      assert.equal(deletedStatus.status, 404);

      const acceptedWithoutEmailDelivery = await request(origin, "/api/form-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({
          form_type: "Slot Booking",
          fullname: "Delivery Failure Test",
          email: "delivery.failure@example.com",
          phone: "+971 50 765 4321",
          booking_type: "Practice Nets",
          booking_date: "2026-07-21",
          booking_date_label: "21 July 2026",
          time_slot: "6:00 PM - 8:00 PM"
        })
      });
      assert.equal(acceptedWithoutEmailDelivery.status, 202);
      const delayedBody = await acceptedWithoutEmailDelivery.json();
      assert.match(delayedBody.reference, /^HCC-\d{8}-[A-F0-9]{8}$/);
      assert.equal(delayedBody.deliveryStatus, "failed");
      assert.match(delayedBody.warning, /request was saved/i);

      const delayedList = await request(origin, "/api/bookings", { headers: { Cookie: cookie } });
      const delayedBooking = (await delayedList.json()).bookings.find((booking) => booking.reference === delayedBody.reference);
      assert.equal(delayedBooking.delivery_status, "failed");
      const deletedDelayed = await request(origin, `/api/bookings/${delayedBody.reference}`, {
        method: "DELETE",
        headers: { Cookie: cookie, Origin: origin }
      });
      assert.equal(deletedDelayed.status, 200);
    });
  });
}

async function main() {
  try {
    await checkHardenedProduction();
    await checkExpiringLocalSession();
    await checkBookingLifecycle();
    console.log("Security checks passed.");
  } finally {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
