const COOKIE_NAME = "jalsa_session";
const SESSION_DAYS = 30;
const CODE_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;
const encoder = new TextEncoder();

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
      if (url.pathname === "/api/register" && request.method === "POST") {
        return await register(request, env);
      }
      if (url.pathname === "/api/login" && request.method === "POST") {
        return await login(request, env);
      }
      if (url.pathname === "/api/verify" && request.method === "POST") {
        return await verify(request, env);
      }
      if (url.pathname === "/api/logout" && request.method === "POST") {
        return await logout(request, env);
      }
      if (url.pathname === "/api/admin/users" && request.method === "GET") {
        return await listUsers(request, env);
      }
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

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function randomCode() {
  // Rejection sampling avoids modulo bias for the six-digit code.
  const max = 0xffffffff - (0xffffffff % 1_000_000);
  let n;
  do { n = crypto.getRandomValues(new Uint32Array(1))[0]; } while (n >= max);
  return String(n % 1_000_000).padStart(6, "0");
}

function toHex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
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
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(`${email}:${code}`)));
}

function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

async function createSession(userId, env) {
  const token = base64Url(randomBytes(32));
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86400000).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  ).bind(tokenHash, userId, now.toISOString(), expiresAt).run();
  return token;
}

function base64Url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

async function sendVerificationEmail(email, code, purpose, env) {
  if (!env.RESEND_API_KEY) throw new Error("Email service is not configured.");
  const from = env.MAIL_FROM || "JALSA <verify@mail.jalsa.me>";
  const replyTo = env.REPLY_TO || "support@jalsa.me";
  const isRegister = purpose === "register";
  const subject = isRegister ? "Verify your JALSA account" : "Your JALSA sign-in code";
  const heading = isRegister ? "Welcome to JALSA" : "Sign in to JALSA";
  const action = isRegister ? "verify your email address" : "sign in to your JALSA account";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      reply_to: replyTo,
      subject,
      text: `Your JALSA code is ${code}. Use it to ${action}. It expires in ${CODE_MINUTES} minutes. If you did not request this, you can ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;background:#fff3df;padding:32px;color:#38231f"><div style="max-width:480px;margin:auto;background:#fffaf2;border:1px solid #e8cda9;border-radius:18px;padding:28px;text-align:center"><h1 style="color:#55151c;margin-top:0">${heading}</h1><p>Use this code to ${action}:</p><div style="font-size:32px;letter-spacing:8px;font-weight:800;color:#a83232;padding:18px">${code}</div><p>This code expires in ${CODE_MINUTES} minutes.</p><p style="font-size:12px;color:#7c6558">If you did not request this code, you can ignore this message.</p></div></div>`,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Resend rejected verification email:", response.status, detail.slice(0, 300));
    throw new Error("The verification email could not be sent. Please try again later.");
  }
}

async function issueEmailCode(email, purpose, env) {
  const now = new Date();
  const nowIso = now.toISOString();
  const since = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM verification_codes WHERE email = ? AND created_at > ?",
  ).bind(email, since).first();
  if ((recent?.total || 0) >= 5) return { error: "Too many codes requested. Please wait an hour and try again.", status: 429 };
  const latest = await env.DB.prepare(
    "SELECT created_at FROM verification_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1",
  ).bind(email).first();
  if (latest && now.getTime() - new Date(latest.created_at).getTime() < 60_000) {
    return { error: "Please wait one minute before requesting another code.", status: 429 };
  }

  const code = randomCode();
  const codeHash = await hmacCode(email, code, env);
  const expiresAt = new Date(now.getTime() + CODE_MINUTES * 60_000).toISOString();
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO verification_codes (id, email, code_hash, purpose, attempts, created_at, expires_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
  ).bind(id, email, codeHash, purpose, nowIso, expiresAt).run();

  try {
    await sendVerificationEmail(email, code, purpose, env);
  } catch (error) {
    await env.DB.prepare("DELETE FROM verification_codes WHERE id = ?").bind(id).run();
    return { error: error.message || "Email could not be sent.", status: 503 };
  }
  return { ok: true, message: `A code was sent to ${email}.` };
}

async function register(request, env) {
  const body = await readBody(request);
  const name = String(body.name || "").trim().slice(0, 80);
  const email = normalizeEmail(body.email);
  if (name.length < 2) return json({ error: "Please enter your name." }, 400);
  if (!validEmail(email)) return json({ error: "Please enter a valid email address." }, 400);

  const existing = await env.DB.prepare("SELECT id, email_verified FROM users WHERE email = ? LIMIT 1").bind(email).first();
  if (existing?.email_verified) return json({ error: "This email already has a verified JALSA account. Please log in." }, 409);

  const now = new Date().toISOString();
  const userId = existing?.id || crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO users (id, display_name, email, email_verified, created_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?)
     ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at
     WHERE users.email_verified = 0`,
  ).bind(userId, name, email, now, now).run();

  const result = await issueEmailCode(email, "register", env);
  if (result.error) return json({ error: result.error }, result.status);
  return json({ ok: true, message: result.message });
}

async function login(request, env) {
  const body = await readBody(request);
  const email = normalizeEmail(body.email);
  if (!validEmail(email)) return json({ error: "Please enter a valid email address." }, 400);
  const user = await env.DB.prepare("SELECT id, email_verified FROM users WHERE email = ? LIMIT 1").bind(email).first();
  if (!user) return json({ error: "No JALSA account was found for this email. Please register first." }, 404);
  if (!user.email_verified) return json({ error: "This account is not verified yet. Please finish registration." }, 403);
  const result = await issueEmailCode(email, "login", env);
  if (result.error) return json({ error: result.error }, result.status);
  return json({ ok: true, message: result.message });
}

async function verify(request, env) {
  const body = await readBody(request);
  const email = normalizeEmail(body.email);
  const code = String(body.code || "").trim();
  if (!validEmail(email) || !/^\d{6}$/.test(code)) return json({ error: "Enter the 6-digit code from your email." }, 400);

  const record = await env.DB.prepare(
    "SELECT id, code_hash, purpose, attempts, expires_at FROM verification_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1",
  ).bind(email).first();
  if (!record || new Date(record.expires_at).getTime() < Date.now()) {
    return json({ error: "That code has expired. Request a new code." }, 400);
  }
  if (record.attempts >= MAX_CODE_ATTEMPTS) return json({ error: "Too many incorrect attempts. Request a new code." }, 429);

  const submittedHash = await hmacCode(email, code, env);
  if (!constantTimeEqual(submittedHash, record.code_hash)) {
    await env.DB.prepare("UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?").bind(record.id).run();
    return json({ error: "The verification code is incorrect." }, 400);
  }

  const user = await env.DB.prepare("SELECT id, display_name, email, email_verified FROM users WHERE email = ? LIMIT 1").bind(email).first();
  if (!user) return json({ error: "Account details were not found. Please register again." }, 404);
  if (record.purpose === "register" && !user.email_verified) {
    const verifiedAt = new Date().toISOString();
    await env.DB.prepare("UPDATE users SET email_verified = 1, verified_at = ?, updated_at = ? WHERE id = ?")
      .bind(verifiedAt, verifiedAt, user.id).run();
    user.email_verified = 1;
    user.verified_at = verifiedAt;
  }
  if (!user.email_verified) return json({ error: "Please complete registration before logging in." }, 403);
  await env.DB.prepare("DELETE FROM verification_codes WHERE email = ?").bind(email).run();
  const token = await createSession(user.id, env);
  return json({ ok: true, user: publicUser(user, env) }, 200, { "Set-Cookie": sessionCookie(token) });
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
