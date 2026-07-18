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
      if (response.status > 0) return;
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

async function getCsrfToken(origin, cookie) {
  const response = await request(origin, "/api/session", { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const session = await response.json();
  assert.match(session.csrfToken, /^[A-Za-z0-9_-]{32,}$/);
  return session.csrfToken;
}

function getCookie(setCookieHeader, name) {
  const match = String(setCookieHeader || "").match(new RegExp(`(?:^|,\\s*)${name}=([^;,]*)`));
  assert.ok(match, `${name} cookie is missing`);
  return `${name}=${match[1]}`;
}

function readSignedCookiePayload(cookie) {
  const encodedValue = cookie.slice(cookie.indexOf("=") + 1);
  const value = decodeURIComponent(encodedValue);
  const payload = value.slice(0, value.indexOf("."));
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

function makeTestJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.test-signature`;
}

async function withFakeSupabase(callback) {
  const user = {
    id: "22222222-2222-4222-8222-222222222222",
    email: "admin@example.com",
    updated_at: "2026-07-15T10:00:00.000Z",
    factors: []
  };
  const state = { revoked: false, challenges: 0, verifications: 0, userChecks: 0 };
  const tokenFor = (aal, amr = [{ method: "password" }]) => makeTestJwt({
    sub: user.id,
    email: user.email,
    aal,
    amr,
    session_id: "11111111-1111-4111-8111-111111111111",
    exp: Math.floor(Date.now() / 1000) + 3600
  });
  const aal1Token = tokenFor("aal1");
  const aal2Token = tokenFor("aal2", [{ method: "password" }, { method: "totp" }]);
  const server = http.createServer(async (request, response) => {
    const parsed = new URL(request.url, `http://${HOST}`);
    let body = "";
    for await (const chunk of request) body += chunk;
    const json = body ? JSON.parse(body) : {};
    const bearer = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const send = (status, payload) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(payload));
    };

    if (parsed.pathname === "/auth/v1/token" && parsed.searchParams.get("grant_type") === "password") {
      if (json.email !== user.email || json.password !== "correct-password") return send(400, { error: "invalid_grant" });
      return send(200, { access_token: aal1Token, refresh_token: "refresh-token", user });
    }
    if (parsed.pathname === "/auth/v1/user" && request.method === "GET") {
      state.userChecks += 1;
      if (state.revoked && bearer === aal2Token) return send(401, { error: "session_revoked" });
      if (![aal1Token, aal2Token].includes(bearer)) return send(401, { error: "invalid_token" });
      return send(200, user);
    }
    if (parsed.pathname === "/auth/v1/factors" && request.method === "POST" && bearer === aal1Token) {
      user.factors = [{ id: "factor-totp-1", factor_type: "totp", status: "unverified" }];
      return send(200, {
        id: "factor-totp-1",
        factor_type: "totp",
        totp: {
          qr_code: "<svg xmlns='http://www.w3.org/2000/svg'></svg>",
          secret: "TESTSECURITYSECRET",
          uri: "otpauth://totp/HCC:admin@example.com?secret=TESTSECURITYSECRET"
        }
      });
    }
    if (parsed.pathname === "/auth/v1/factors/factor-totp-1/challenge" && request.method === "POST" && bearer === aal1Token) {
      state.challenges += 1;
      return send(200, { id: "challenge-1", type: "totp", expires_at: Math.floor(Date.now() / 1000) + 60 });
    }
    if (parsed.pathname === "/auth/v1/factors/factor-totp-1/verify" && request.method === "POST" && bearer === aal1Token) {
      state.verifications += 1;
      if (json.challenge_id !== "challenge-1" || json.code !== "123456") return send(400, { error: "bad_code" });
      user.factors = [{ id: "factor-totp-1", factor_type: "totp", status: "verified" }];
      return send(200, { access_token: aal2Token, refresh_token: "refresh-token-2", user });
    }
    if (parsed.pathname === "/auth/v1/logout" && request.method === "POST" && bearer === aal2Token) {
      state.revoked = true;
      return send(204, {});
    }
    return send(404, { error: "not_found", path: parsed.pathname });
  });
  await new Promise((resolve) => server.listen(0, HOST, resolve));
  const address = server.address();
  try {
    await callback(`http://${HOST}:${address.port}`, state, { aal1Token, aal2Token });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
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
    const health = await request(origin, "/health");
    assert.equal(health.status, 503);
    const healthBody = await health.json();
    assert.equal(healthBody.ok, false);
    assert.equal(healthBody.ready, false);
    assert.deepEqual(Object.keys(healthBody).sort(), ["ok", "ready"]);

    const home = await request(origin, "/");
    assert.equal(home.status, 200);
    const csp = home.headers.get("content-security-policy") || "";
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /script-src-attr 'none'/);
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
    assert.equal(home.headers.get("x-frame-options"), "DENY");
    assert.equal((await request(origin, "/logo.webp")).status, 200);
    assert.equal((await request(origin, "/gallery-local-1.webp")).status, 200);
    assert.equal((await request(origin, "/gallery-local-2.webp")).status, 200);
    assert.equal((await request(origin, "/site.js")).status, 200);
    assert.equal((await request(origin, "/booking-status.js")).status, 200);
    assert.equal((await request(origin, "/api/content")).status, 200);
    const bookingStatusPage = await request(origin, "/booking-status");
    assert.equal(bookingStatusPage.status, 200);
    assert.match(await bookingStatusPage.text(), /id="status-form"/);
    const bookingConfirmationPage = await request(origin, "/booking-confirmation");
    assert.equal(bookingConfirmationPage.status, 200);
    assert.equal(bookingConfirmationPage.headers.get("cache-control"), "no-store");
    const bookingConfirmationHtml = await bookingConfirmationPage.text();
    assert.match(bookingConfirmationHtml, /id="confirmation-reference"/);
    assert.match(bookingConfirmationHtml, /src="\/booking-confirmation\.js"/);

    for (const pathname of ["/server.js", "/package.json", "/README.md", "/supabase-schema.sql", "/data/content.json", "/.env"]) {
      assert.equal((await request(origin, pathname)).status, 404, `${pathname} must not be public`);
    }

    assert.equal((await request(origin, "/admin")).status, 302);
    assert.equal((await request(origin, "/%61dmin")).status, 302);
    assert.equal((await request(origin, "/%61dmin.js")).status, 302);
    assert.equal((await request(origin, "/%69ndex.html")).status, 302);
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

    const missingOriginLogin = await request(origin, "/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "username=admin&password=change-this-password"
    });
    assert.equal(missingOriginLogin.status, 403);

    const oversizedLogin = await request(origin, "/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin },
      body: `username=admin&password=${"x".repeat(9000)}`
    });
    assert.equal(oversizedLogin.status, 413);

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

    const overlongPhone = await request(origin, "/api/form-submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({
        form_type: "Slot Booking",
        fullname: "Test User",
        phone: "+9715012345678901",
        email: "test@example.com",
        booking_date: "2026-07-20"
      })
    });
    assert.equal(overlongPhone.status, 400);
    assert.match((await overlongPhone.json()).error, /7 to 15 digits/);

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

    const wrongContentType = await request(origin, "/api/form-submit", {
      method: "POST",
      headers: { "Content-Type": "text/plain", Origin: origin },
      body: "not-json"
    });
    assert.equal(wrongContentType.status, 415);

    const sitemap = await request(origin, "/sitemap.xml", {
      headers: { Host: "attacker.example" }
    });
    assert.match(await sitemap.text(), new RegExp(`http://${HOST}:${port}`));

    const robots = await request(origin, "/robots.txt");
    assert.equal(robots.status, 200);
    const robotsText = await robots.text();
    assert.match(robotsText, /^User-agent: \*\nAllow: \/$/m);
    assert.match(robotsText, /^Disallow: \/admin$/m);
    assert.match(robotsText, /^Disallow: \/api\/$/m);
  });
}

async function checkExpiringLocalSession() {
  const port = String(20000 + (process.pid % 1000));
  await withServer({
    PORT: port,
    NODE_ENV: "production",
    TRUST_PROXY: "true",
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
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /Max-Age=(?:3599|3600)/);

    const cookieValue = decodeURIComponent(cookie.split(";", 1)[0].split("=", 2)[1]);
    const payload = cookieValue.slice(0, cookieValue.indexOf("."));
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    assert.equal(session.expiresAt - session.issuedAt, 60 * 60 * 1000);

    const admin = await request(origin, "/admin", { headers: { Cookie: cookie.split(";", 1)[0] } });
    assert.equal(admin.status, 200);
    const bookings = await request(origin, "/api/bookings", { headers: { Cookie: cookie.split(";", 1)[0] } });
    assert.equal(bookings.status, 200);
    assert.deepEqual((await bookings.json()).bookings, []);
    const cookieHeader = cookie.split(";", 1)[0];
    const csrfToken = await getCsrfToken(origin, cookieHeader);

    const missingCsrf = await request(origin, "/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader, Origin: origin },
      body: JSON.stringify({ tournaments: [], images: [], socials: [], testimonials: [] })
    });
    assert.equal(missingCsrf.status, 403);

    const hostileName = "O'Connor </button><script>globalThis.hccXss=true</script>";
    const contentWrite = await request(origin, "/api/content", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
        Origin: origin,
        "X-HCC-CSRF": csrfToken,
        "X-Forwarded-For": "198.51.100.10, 203.0.113.25"
      },
      body: JSON.stringify({
        tournaments: [{
          id: "bad'id",
          name: hostileName,
          posterPublicId: "hcc-website/tournaments/internal-provider-id",
          registerLink: "javascript:alert(1)",
          cricLink: "https://user:password@example.com/private",
          poster: "data:image/svg+xml,<svg onload=alert(1)></svg>"
        }],
        images: [{ id: "hidden-image", title: "Private draft", src: "https://example.com/private.jpg", published: false, publicId: "provider-secret" }],
        socials: [{ id: "social-1", label: "Unsafe", url: "javascript:alert(1)" }],
        testimonials: []
      })
    });
    assert.equal(contentWrite.status, 200);
    const sanitizedContent = await contentWrite.json();
    assert.equal(sanitizedContent.tournaments[0].id, "tournaments-1");
    assert.equal(sanitizedContent.tournaments[0].name, hostileName);
    assert.equal(sanitizedContent.tournaments[0].registerLink, "");
    assert.equal(sanitizedContent.tournaments[0].cricLink, "");
    assert.equal(sanitizedContent.tournaments[0].poster, "");
    assert.equal(sanitizedContent.tournaments[0].posterPublicId, "hcc-website/tournaments/internal-provider-id");
    assert.equal(sanitizedContent.socials[0].url, "");

    const publicContentResponse = await request(origin, "/api/content");
    assert.equal(publicContentResponse.status, 200);
    const publicContent = await publicContentResponse.json();
    assert.equal(Object.hasOwn(publicContent.tournaments[0], "posterPublicId"), false);
    assert.equal(publicContent.images.length, 0);

    const auditResponse = await request(origin, "/api/audit", { headers: { Cookie: cookieHeader } });
    const auditEntries = (await auditResponse.json()).entries;
    assert.equal(auditEntries.find((entry) => entry.action === "content.save").ip, "203.0.113.25");

    const outsideCloudinaryFolder = await request(origin, "/api/cloudinary/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader, Origin: origin, "X-HCC-CSRF": csrfToken },
      body: JSON.stringify({ publicId: "another-project/private-image" })
    });
    assert.equal(outsideCloudinaryFolder.status, 400);

    const siteSource = fs.readFileSync(path.join(ROOT, "site.html"), "utf8");
    const siteScript = fs.readFileSync(path.join(ROOT, "site.js"), "utf8");
    assert.match(siteScript, /data-tournament-action="register"/);
    assert.equal((siteSource.match(/maxlength="24" data-phone-input/g) || []).length, 2);
    assert.match(siteScript, /Phone number must contain 7 to 15 digits/);
    assert.match(siteScript, /sessionStorage\.setItem\('hcc-booking-confirmation'/);
    assert.match(siteScript, /window\.location\.assign\(confirmationPath\)/);
    assert.doesNotMatch(siteSource, /\son[a-z]+\s*=/i);
    assert.doesNotMatch(siteSource, /<script(?![^>]*type="application\/ld\+json")(?![^>]*src=)/i);

    assert.equal((await request(origin, "/logout")).status, 405);
    const logout = await request(origin, "/logout", {
      method: "POST",
      headers: { Cookie: cookieHeader, Origin: origin, "X-HCC-CSRF": csrfToken }
    });
    assert.equal(logout.status, 302);
    assert.match(logout.headers.get("set-cookie") || "", /Max-Age=0/);
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
      BOOKING_RETENTION_DAYS: "180"
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
      const csrfToken = await getCsrfToken(origin, cookie);

      const bookingList = await request(origin, "/api/bookings", { headers: { Cookie: cookie } });
      assert.equal(bookingList.status, 200);
      const savedBooking = (await bookingList.json()).bookings.find((booking) => booking.reference === reference);
      assert.equal(savedBooking.email, "security.test@example.com");
      assert.equal(savedBooking.delivery_status, "sent");

      const updated = await request(origin, `/api/bookings/${reference}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin, "X-HCC-CSRF": csrfToken },
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
        headers: { Cookie: cookie, Origin: origin, "X-HCC-CSRF": csrfToken }
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
        headers: { Cookie: cookie, Origin: origin, "X-HCC-CSRF": csrfToken }
      });
      assert.equal(deletedDelayed.status, 200);
    });
  });
}

async function checkSupabaseMfaAndRevocation() {
  const port = String(22000 + (process.pid % 1000));
  await withFakeSupabase(async (supabaseOrigin, state, tokens) => {
    await withServer({
      PORT: port,
      NODE_ENV: "production",
      TRUST_PROXY: "false",
      PUBLIC_ORIGIN: `http://${HOST}:${port}`,
      SUPABASE_AUTH_ENABLED: "true",
      SUPABASE_MFA_REQUIRED: "true",
      SUPABASE_URL: supabaseOrigin,
      SUPABASE_ANON_KEY: "test-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "",
      ADMIN_EMAILS: "admin@example.com",
      ALLOW_LOCAL_ADMIN: "false",
      SESSION_SECRET: "mfa-security-check-session-secret",
      BOOKING_RETENTION_DAYS: "180"
    }, async (origin) => {
      const login = await request(origin, "/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin },
        body: "username=admin%40example.com&password=correct-password"
      });
      assert.equal(login.status, 302);
      assert.equal(login.headers.get("location"), "/mfa");
      const pendingCookie = getCookie(login.headers.get("set-cookie"), "hcc_mfa_pending");
      const pendingPayload = readSignedCookiePayload(pendingCookie);
      assert.equal(pendingPayload.identity, "admin@example.com");
      assert.notEqual(pendingPayload.accessToken, tokens.aal1Token);
      assert.equal(JSON.stringify(pendingPayload).includes(tokens.aal1Token), false);

      const setup = await request(origin, "/mfa", { headers: { Cookie: pendingCookie } });
      assert.equal(setup.status, 200);
      assert.match(await setup.text(), /Secure your account/);

      const enrollWithoutOrigin = await request(origin, "/mfa/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: pendingCookie },
        body: `csrf=${encodeURIComponent(pendingPayload.csrfToken)}`
      });
      assert.equal(enrollWithoutOrigin.status, 403);

      const enroll = await request(origin, "/mfa/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: pendingCookie, Origin: origin },
        body: `csrf=${encodeURIComponent(pendingPayload.csrfToken)}`
      });
      assert.equal(enroll.status, 200);
      const enrolledCookie = getCookie(enroll.headers.get("set-cookie"), "hcc_mfa_pending");
      const enrolledPayload = readSignedCookiePayload(enrolledCookie);
      const enrollmentHtml = await enroll.text();
      assert.match(enrollmentHtml, /Authenticator setup QR code/);
      assert.match(enrollmentHtml, /data:image\/svg\+xml;base64,/);
      assert.match(enrollmentHtml, /TESTSECURITYSECRET/);
      assert.equal(JSON.stringify(enrolledPayload).includes("TESTSECURITYSECRET"), false);

      const verify = await request(origin, "/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: enrolledCookie, Origin: origin },
        body: `csrf=${encodeURIComponent(enrolledPayload.csrfToken)}&code=123456`
      });
      const verifyFailure = verify.status === 302 ? "" : await verify.clone().text();
      assert.equal(verify.status, 302, verifyFailure);
      assert.equal(verify.headers.get("location"), "/admin");
      const adminCookie = getCookie(verify.headers.get("set-cookie"), "hcc_admin_session");
      const adminPayload = readSignedCookiePayload(adminCookie);
      assert.equal(adminPayload.aal, "aal2");
      assert.notEqual(adminPayload.accessToken, tokens.aal2Token);
      assert.equal(JSON.stringify(adminPayload).includes(tokens.aal2Token), false);
      assert.equal(state.challenges, 1);
      assert.equal(state.verifications, 1);

      const admin = await request(origin, "/admin", { headers: { Cookie: adminCookie } });
      assert.equal(admin.status, 200);
      assert.equal(admin.headers.get("cache-control"), "private, no-store");
      const encodedAdminScript = await request(origin, "/%61dmin.js", { headers: { Cookie: adminCookie } });
      assert.equal(encodedAdminScript.status, 200);
      assert.equal(encodedAdminScript.headers.get("cache-control"), "private, no-store");
      const csrfToken = await getCsrfToken(origin, adminCookie);
      const badCsrf = await request(origin, "/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie, Origin: origin, "X-HCC-CSRF": "wrong-token" },
        body: JSON.stringify({ tournaments: [], images: [], socials: [], testimonials: [] })
      });
      assert.equal(badCsrf.status, 403);

      const logout = await request(origin, "/logout", {
        method: "POST",
        headers: { Cookie: adminCookie, Origin: origin, "X-HCC-CSRF": csrfToken }
      });
      assert.equal(logout.status, 302);
      assert.equal(state.revoked, true);
      const stolenCookie = await request(origin, "/admin", { headers: { Cookie: adminCookie } });
      assert.equal(stolenCookie.status, 302);
      assert.equal(stolenCookie.headers.get("location"), "/login");
      assert.ok(state.userChecks >= 3);
    });
  });
}

async function main() {
  try {
    await checkHardenedProduction();
    await checkExpiringLocalSession();
    await checkBookingLifecycle();
    await checkSupabaseMfaAndRevocation();
    console.log("Security checks passed.");
  } finally {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
