const COOKIE_NAME = "jalsa_session";
const SESSION_DAYS = 30;
const CODE_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;
const MAX_LOGIN_FAILURES = 8;
const LOGIN_WINDOW_MINUTES = 15;
const PASSWORD_ITERATIONS = 100000;
const encoder = new TextEncoder();
const DUMMY_PASSWORD_HASH = "pbkdf2-sha256$120000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      const assetResponse = await env.ASSETS.fetch(request);
      const headers = new Headers(assetResponse.headers);
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
      headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
      headers.set("X-Frame-Options", "SAMEORIGIN");
      return new Response(assetResponse.body, { status: assetResponse.status, headers });
    }

    if (!env.DB) return json({ error: "Account storage is not configured yet." }, 503);
    if (request.method !== "GET") {
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin) return json({ error: "Request origin rejected." }, 403);
    }

    try {
      if (url.pathname === "/api/me" && request.method === "GET") {
        const user = await getSessionUser(request, env);
        return json({ user: publicUser(user, env) });
      }
      if (url.pathname === "/api/register" && request.method === "POST") return await register(request, env);
      if (url.pathname === "/api/login" && request.method === "POST") return await login(request, env);
      if (url.pathname === "/api/verify" && request.method === "POST") return await verifyRegistration(request, env);
      if (url.pathname === "/api/forgot-password" && request.method === "POST") return await forgotPassword(request, env);
      if (url.pathname === "/api/reset-password" && request.method === "POST") return await resetPassword(request, env);
      if (url.pathname === "/api/logout" && request.method === "POST") return await logout(request, env);
      if (url.pathname === "/api/admin/users" && request.method === "GET") return await listUsers(request, env);
      return json({ error: "Not found." }, 404);
    } catch (error) {
      console.error("JALSA API error:", error?.message || "unknown");
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
  },
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

async function readBody(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) throw new Error("Expected JSON request body.");
  const body = await request.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request.");
  return body;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function validPassword(value) {
  return typeof value === "string" && value.length >= 10 && value.length <= 128;
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function randomCode() {
  const max = 0xffffffff - (0xffffffff % 1000000);
  let n;
  do { n = crypto.getRandomValues(new Uint32Array(1))[0]; } while (n >= max);
  return String(n % 1000000).padStart(6, "0");
}

function toHex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toBase64Url(bytes) {
  let binary = "";
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sha256Hex(value) {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function hmacCode(email, code, env) {
  if (!env.VERIFICATION_SECRET) throw new Error("Verification secret is not configured.");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.VERIFICATION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(email + ":" + code)));
}

function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PASSWORD_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return "pbkdf2-sha256$" + PASSWORD_ITERATIONS + "$" + toBase64Url(salt) + "$" + toBase64Url(bits);
}

async function verifyPassword(password, storedHash) {
  const parts = String(storedHash || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 100000) return false;
  try {
    const salt = fromBase64Url(parts[2]);
    const expected = fromBase64Url(parts[3]);
    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
      key,
      expected.length * 8,
    );
    return constantTimeEqual(toBase64Url(new Uint8Array(bits)), toBase64Url(expected));
  } catch {
    return false;
  }
}

function cookieValue(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

function sessionCookie(token, maxAge = SESSION_DAYS * 24 * 60 * 60) {
  return COOKIE_NAME + "=" + token + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + maxAge;
}

async function createSession(userId, env) {
  const token = toBase64Url(randomBytes(32));
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86400000).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  ).bind(tokenHash, userId, now.toISOString(), expiresAt).run();
  return token;
}

async function getSessionUser(request, env) {
  const token = cookieValue(request, COOKIE_NAME);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  return await env.DB.prepare(
    `SELECT u.id, u.display_name, u.email, u.email_verified, u.created_at, u.verified_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND u.email_verified = 1 LIMIT 1`,
  ).bind(tokenHash, new Date().toISOString()).first();
}

function publicUser(user, env) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.display_name,
    email: user.email,
    emailVerified: !!user.email_verified,
    isAdmin: normalizeEmail(user.email) === normalizeEmail(env.ADMIN_EMAIL),
  };
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

async function sendAccountEmail(email, code, purpose, env) {
  if (!env.RESEND_API_KEY) throw new Error("Email service is not configured.");
  const from = env.MAIL_FROM || "JALSA <Accountservice@jalsa.me>";
  const replyTo = env.REPLY_TO || "support@jalsa.me";
  const isRegistration = purpose === "register";
  const subject = isRegistration ? "Welcome to JALSA — verify your email" : "Reset your JALSA password";
  const heading = isRegistration ? "Welcome to JALSA" : "Reset your password";
  const arabicHeading = isRegistration ? "أهلاً بك في جلسة" : "إعادة تعيين كلمة المرور";
  const englishAction = isRegistration ? "Use this code to verify your email address and activate your account." : "Use this code to choose a new password for your JALSA account.";
  const arabicAction = isRegistration ? "استخدم هذا الرمز لتأكيد بريدك الإلكتروني وتفعيل حسابك." : "استخدم هذا الرمز لاختيار كلمة مرور جديدة لحسابك في جلسة.";
  const safeEmail = escapeHtml(email);
  const logo = "https://jalsa.me/jalsa-logo.png";
  const html = '<!doctype html><html><body style="margin:0;padding:0;background:#fff3df;font-family:Arial,Helvetica,sans-serif;color:#38231f">' +
    '<div style="padding:34px 16px"><div style="max-width:520px;margin:0 auto;background:#fffaf2;border:1px solid #e8cda9;border-radius:22px;overflow:hidden">' +
    '<div style="background:linear-gradient(120deg,#55151c,#a83232,#ed8245);padding:26px;text-align:center">' +
    '<img src="' + logo + '" alt="JALSA" width="150" style="display:block;width:150px;max-width:60%;height:auto;margin:0 auto 12px">' +
    '<div style="font-size:12px;letter-spacing:4px;font-weight:700;color:#ffe8cf">LET’S PLAY TOGETHER</div></div>' +
    '<div style="padding:32px 30px;text-align:center"><h1 style="font-size:25px;margin:0 0 8px;color:#55151c">' + heading + '</h1>' +
    '<div dir="rtl" style="font-size:18px;font-weight:700;color:#a83232;margin-bottom:18px">' + arabicHeading + '</div>' +
    '<p style="font-size:15px;line-height:1.65;margin:0 0 8px">' + englishAction + '</p>' +
    '<p dir="rtl" style="font-size:15px;line-height:1.8;margin:0 0 20px">' + arabicAction + '</p>' +
    '<div style="display:inline-block;background:#fff0d9;border:1px solid #e4b96b;border-radius:14px;padding:17px 24px;margin:4px auto 18px">' +
    '<div style="font-size:11px;letter-spacing:2px;color:#7c6558;margin-bottom:6px">YOUR JALSA CODE</div>' +
    '<div style="font-size:34px;letter-spacing:8px;font-weight:800;color:#a83232">' + code + '</div></div>' +
    '<p style="font-size:13px;color:#7c6558;line-height:1.6;margin:0">This code expires in ' + CODE_MINUTES + ' minutes.<br>لا تشارك هذا الرمز مع أي شخص.</p>' +
    '<p style="font-size:12px;color:#9a8272;line-height:1.6;margin:22px 0 0">Sent to ' + safeEmail + '. If you did not request this, you can safely ignore this email.</p>' +
    '</div><div style="padding:16px;text-align:center;background:#f7e4c8;color:#7c6558;font-size:12px">JALSA · Friends, family, and game nights<br><a href="https://jalsa.me" style="color:#7c2028;text-decoration:none">jalsa.me</a> · <a href="mailto:' + escapeHtml(replyTo) + '" style="color:#7c2028;text-decoration:none">Support</a></div>' +
    '</div></div></body></html>';
  const text = heading + "\n" + arabicHeading + "\n\n" + englishAction + "\n" + arabicAction +
    "\n\nYour JALSA code: " + code + "\nThis code expires in " + CODE_MINUTES +
    " minutes. Never share this code.\n\nIf you did not request this, ignore this email.\n" + safeEmail;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [email], reply_to: replyTo, subject, text, html }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Resend rejected JALSA email:", response.status, detail.slice(0, 300));
    throw new Error("The email could not be sent. Please try again later.");
  }
}

async function issueEmailCode(email, purpose, env) {
  const now = new Date();
  const nowIso = now.toISOString();
  const since = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM verification_codes WHERE email = ? AND purpose = ? AND created_at > ?",
  ).bind(email, purpose, since).first();
  if ((recent?.total || 0) >= 5) return { error: "Too many codes requested. Please wait an hour and try again.", status: 429 };
  const latest = await env.DB.prepare(
    "SELECT created_at FROM verification_codes WHERE email = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1",
  ).bind(email, purpose).first();
  if (latest && now.getTime() - new Date(latest.created_at).getTime() < 60000) {
    return { error: "Please wait one minute before requesting another code.", status: 429 };
  }

  const code = randomCode();
  const codeHash = await hmacCode(email, code, env);
  const expiresAt = new Date(now.getTime() + CODE_MINUTES * 60000).toISOString();
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO verification_codes (id, email, code_hash, purpose, attempts, created_at, expires_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
  ).bind(id, email, codeHash, purpose, nowIso, expiresAt).run();

  try {
    await sendAccountEmail(email, code, purpose, env);
  } catch (error) {
    await env.DB.prepare("DELETE FROM verification_codes WHERE id = ?").bind(id).run();
    return { error: error.message || "Email could not be sent.", status: 503 };
  }
  return { ok: true, message: "A code was sent to " + email + "." };
}

async function register(request, env) {
  const body = await readBody(request);
  const name = String(body.name || "").trim().slice(0, 80);
  const email = normalizeEmail(body.email);
  const password = body.password;
  if (name.length < 2) return json({ error: "Please enter your name." }, 400);
  if (!validEmail(email)) return json({ error: "Please enter a valid email address." }, 400);
  if (!validPassword(password)) return json({ error: "Your password must contain 10 to 128 characters." }, 400);

  const existing = await env.DB.prepare("SELECT id, email_verified FROM users WHERE email = ? LIMIT 1").bind(email).first();
  if (existing && existing.email_verified) {
    return json({ error: "This email already has a JALSA account. Log in or use Forgot password." }, 409);
  }

  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  const userId = existing ? existing.id : crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO users (id, display_name, email, password_hash, email_verified, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name,
       password_hash = excluded.password_hash, updated_at = excluded.updated_at
     WHERE users.email_verified = 0`,
  ).bind(userId, name, email, passwordHash, now, now).run();

  const result = await issueEmailCode(email, "register", env);
  if (result.error) return json({ error: result.error }, result.status);
  return json({ ok: true, message: result.message });
}

async function isLoginLocked(email, env) {
  const row = await env.DB.prepare("SELECT failure_count, window_started_at, locked_until FROM login_attempts WHERE email = ? LIMIT 1")
    .bind(email).first();
  if (!row) return false;
  const now = Date.now();
  if (row.locked_until && new Date(row.locked_until).getTime() > now) return true;
  if (now - new Date(row.window_started_at).getTime() > LOGIN_WINDOW_MINUTES * 60000) {
    await env.DB.prepare("DELETE FROM login_attempts WHERE email = ?").bind(email).run();
    return false;
  }
  return false;
}

async function recordLoginFailure(email, env) {
  const now = new Date();
  const nowIso = now.toISOString();
  const cutoff = new Date(now.getTime() - LOGIN_WINDOW_MINUTES * 60000).toISOString();
  const row = await env.DB.prepare("SELECT failure_count, window_started_at FROM login_attempts WHERE email = ? LIMIT 1")
    .bind(email).first();
  if (!row || row.window_started_at < cutoff) {
    await env.DB.prepare(
      "INSERT INTO login_attempts (email, failure_count, window_started_at, locked_until) VALUES (?, 1, ?, NULL) ON CONFLICT(email) DO UPDATE SET failure_count = 1, window_started_at = excluded.window_started_at, locked_until = NULL",
    ).bind(email, nowIso).run();
    return;
  }
  const failures = Number(row.failure_count || 0) + 1;
  const lockedUntil = failures >= MAX_LOGIN_FAILURES ? new Date(now.getTime() + LOGIN_WINDOW_MINUTES * 60000).toISOString() : null;
  await env.DB.prepare("UPDATE login_attempts SET failure_count = ?, locked_until = ? WHERE email = ?")
    .bind(failures, lockedUntil, email).run();
}

async function login(request, env) {
  const body = await readBody(request);
  const email = normalizeEmail(body.email);
  const password = body.password;
  if (!validEmail(email) || typeof password !== "string" || password.length > 128) {
    return json({ error: "Email or password is incorrect." }, 401);
  }
  if (await isLoginLocked(email, env)) {
    return json({ error: "Too many unsuccessful attempts. Please wait 15 minutes before trying again." }, 429);
  }
  const user = await env.DB.prepare(
    "SELECT id, display_name, email, email_verified, password_hash FROM users WHERE email = ? LIMIT 1",
  ).bind(email).first();
  const passwordOk = await verifyPassword(password, user?.password_hash || DUMMY_PASSWORD_HASH);
  if (!user || !user.password_hash || !passwordOk) {
    await recordLoginFailure(email, env);
    return json({ error: "Email or password is incorrect." }, 401);
  }
  if (!user.email_verified) {
    return json({ error: "Your email is not verified yet. Register again with this email to receive a new verification code." }, 403);
  }
  await env.DB.prepare("DELETE FROM login_attempts WHERE email = ?").bind(email).run();
  const token = await createSession(user.id, env);
  return json({ ok: true, user: publicUser(user, env) }, 200, { "Set-Cookie": sessionCookie(token) });
}

async function readAndValidateCode(email, code, purpose, env) {
  if (!validEmail(email) || !/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from your email.", status: 400 };
  const record = await env.DB.prepare(
    "SELECT id, code_hash, attempts, expires_at FROM verification_codes WHERE email = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1",
  ).bind(email, purpose).first();
  if (!record || new Date(record.expires_at).getTime() < Date.now()) {
    return { error: "That code has expired. Request a new code.", status: 400 };
  }
  if (record.attempts >= MAX_CODE_ATTEMPTS) {
    return { error: "Too many incorrect attempts. Request a new code.", status: 429 };
  }
  const submittedHash = await hmacCode(email, code, env);
  if (!constantTimeEqual(submittedHash, record.code_hash)) {
    await env.DB.prepare("UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?").bind(record.id).run();
    return { error: "The verification code is incorrect.", status: 400 };
  }
  return { record };
}

async function verifyRegistration(request, env) {
  const body = await readBody(request);
  const email = normalizeEmail(body.email);
  const code = String(body.code || "").trim();
  const checked = await readAndValidateCode(email, code, "register", env);
  if (checked.error) return json({ error: checked.error }, checked.status);
  const user = await env.DB.prepare(
    "SELECT id, display_name, email, email_verified FROM users WHERE email = ? LIMIT 1",
  ).bind(email).first();
  if (!user) return json({ error: "Account details were not found. Please register again." }, 404);
  const verifiedAt = new Date().toISOString();
  await env.DB.prepare("UPDATE users SET email_verified = 1, verified_at = ?, updated_at = ? WHERE id = ?")
    .bind(verifiedAt, verifiedAt, user.id).run();
  user.email_verified = 1;
  await env.DB.prepare("DELETE FROM verification_codes WHERE email = ? AND purpose = 'register'").bind(email).run();
  const token = await createSession(user.id, env);
  return json({ ok: true, user: publicUser(user, env) }, 200, { "Set-Cookie": sessionCookie(token) });
}

async function forgotPassword(request, env) {
  const body = await readBody(request);
  const email = normalizeEmail(body.email);
  if (!validEmail(email)) return json({ error: "Please enter a valid email address." }, 400);
  const user = await env.DB.prepare("SELECT id, email_verified FROM users WHERE email = ? LIMIT 1").bind(email).first();
  if (user && user.email_verified) {
    const result = await issueEmailCode(email, "reset", env);
    if (result.error) console.info("JALSA password reset code not issued:", result.status);
  }
  return json({ ok: true, message: "If a verified JALSA account exists for that email, a password reset code has been sent." });
}

async function resetPassword(request, env) {
  const body = await readBody(request);
  const email = normalizeEmail(body.email);
  const code = String(body.code || "").trim();
  const password = body.password;
  if (!validPassword(password)) return json({ error: "Your password must contain 10 to 128 characters." }, 400);
  const checked = await readAndValidateCode(email, code, "reset", env);
  if (checked.error) return json({ error: checked.error }, checked.status);
  const user = await env.DB.prepare("SELECT id FROM users WHERE email = ? AND email_verified = 1 LIMIT 1").bind(email).first();
  if (!user) return json({ error: "That reset request is no longer valid. Request a new code." }, 400);
  const passwordHash = await hashPassword(password);
  await env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
    .bind(passwordHash, new Date().toISOString(), user.id).run();
  await env.DB.prepare("DELETE FROM verification_codes WHERE email = ? AND purpose = 'reset'").bind(email).run();
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id).run();
  await env.DB.prepare("DELETE FROM login_attempts WHERE email = ?").bind(email).run();
  return json({ ok: true, message: "Your password has been reset. Please log in with your new password." });
}

async function logout(request, env) {
  const token = cookieValue(request, COOKIE_NAME);
  if (token) {
    const hash = await sha256Hex(token);
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(hash).run();
  }
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
}

async function listUsers(request, env) {
  const currentUser = await getSessionUser(request, env);
  if (!currentUser || !env.ADMIN_EMAIL || normalizeEmail(currentUser.email) !== normalizeEmail(env.ADMIN_EMAIL)) {
    return json({ error: "Administrator access required." }, 403);
  }
  const result = await env.DB.prepare(
    `SELECT display_name AS name, email, email_verified, created_at, verified_at
     FROM users ORDER BY created_at DESC LIMIT 500`,
  ).all();
  return json({ users: (result.results || []).map((row) => ({
    name: row.name,
    email: row.email,
    email_verified: !!row.email_verified,
    created_at: row.created_at,
    verified_at: row.verified_at,
  })) });
}
