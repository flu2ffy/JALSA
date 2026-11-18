const COOKIE_NAME = "jalsa_session";
const SESSION_DAYS = 30;
const CODE_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;
const MAX_LOGIN_FAILURES = 8;
const LOGIN_WINDOW_MINUTES = 15;
const PASSWORD_ITERATIONS = 100000;
const encoder = new TextEncoder();
const DUMMY_PASSWORD_HASH = "pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

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

      if (url.pathname === "/api/remote/create" && request.method === "POST") return await createRemoteRoom(request, env);
      if (url.pathname === "/api/remote/poll" && request.method === "GET") return await pollRemoteHost(request, env, url);
      if (url.pathname === "/api/remote/claim" && request.method === "POST") return await claimRemoteController(request, env);
      if (url.pathname === "/api/remote/read" && request.method === "POST") return await getRemoteState(request, env);
      if (url.pathname === "/api/remote/state" && request.method === "POST") return await updateRemoteState(request, env);
      if (url.pathname === "/api/remote/command" && request.method === "POST") return await sendRemoteCommand(request, env);
      if (url.pathname === "/api/remote/end" && request.method === "POST") return await endRemoteRoom(request, env);
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
      if (url.pathname === "/api/admin/media" && request.method === "POST") return await uploadAdminMedia(request, env);
      if (url.pathname.startsWith("/api/media/") && (request.method === "GET" || request.method === "HEAD")) return await servePublicMedia(request, env, url);
      if (url.pathname === "/api/profile" && request.method === "POST") return await updateProfile(request, env);
      if (url.pathname === "/api/feedback" && request.method === "POST") return await submitFeedback(request, env);
      if (url.pathname === "/api/game-content" && request.method === "GET") return await getGameContent(request, env);
      if (url.pathname === "/api/admin/content" && request.method === "GET") return await getAdminContent(request, env);
      if (url.pathname === "/api/admin/content/seed" && request.method === "POST") return await seedGameContent(request, env);
      if (url.pathname === "/api/admin/categories" && request.method === "POST") return await createCategory(request, env);
      if (url.pathname === "/api/admin/questions" && request.method === "POST") return await createQuestion(request, env);
      if (url.pathname === "/api/admin/feedback" && request.method === "GET") return await listFeedback(request, env);
      const adminParts = url.pathname.split("/");
      if (adminParts.length === 5 && adminParts[1] === "api" && adminParts[2] === "admin") {
        const itemId = decodeURIComponent(adminParts[4]);
        if (adminParts[3] === "users" && request.method === "GET") return await getAdminUser(request, env, itemId);
        if (adminParts[3] === "users" && request.method === "PATCH") return await updateAdminUser(request, env, itemId);
        if (adminParts[3] === "users" && request.method === "DELETE") return await deleteAdminUser(request, env, itemId);
        if (adminParts[3] === "categories" && request.method === "PATCH") return await updateCategory(request, env, itemId);
        if (adminParts[3] === "categories" && request.method === "DELETE") return await deleteCategory(request, env, itemId);
        if (adminParts[3] === "questions" && request.method === "PATCH") return await updateQuestion(request, env, itemId);
        if (adminParts[3] === "questions" && request.method === "DELETE") return await deleteQuestion(request, env, itemId);
        if (adminParts[3] === "feedback" && request.method === "PATCH") return await updateFeedbackStatus(request, env, itemId);
        if (adminParts[3] === "feedback" && request.method === "DELETE") return await deleteFeedback(request, env, itemId);
      }
      return json({ error: "Not found." }, 404);
    } catch (error) {
      console.error("JALSA API error:", error?.message || "unknown");
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
  },
};


async function createRemoteRoom(request, env) {
  const user=await getSessionUser(request,env);if(!user)return json({error:"Sign in on the JALSA game screen first."},401);
  const roomId=toBase64Url(randomBytes(18)),key=toBase64Url(randomBytes(32)),now=new Date(),expires=new Date(now.getTime()+2*60*60*1000).toISOString();
  await env.DB.prepare("INSERT INTO remote_rooms (room_id,token_hash,host_user_id,state_json,command_seq,created_at,expires_at) VALUES (?,?,?,'{}',0,?,?)")
    .bind(roomId,await sha256Hex(key),user.id,now.toISOString(),expires).run();
  return json({roomId,key,expiresAt:expires});
}
async function pollRemoteHost(request,env,url){
  const user=await getSessionUser(request,env);if(!user)return json({error:"Host session expired. Sign in again."},401);
  const roomId=url.searchParams.get("roomId")||"";
  const room=await env.DB.prepare("SELECT host_user_id,command_seq,command_json,expires_at,ended_at FROM remote_rooms WHERE room_id=? LIMIT 1").bind(roomId).first();
  if(!room||room.host_user_id!==user.id)return json({error:"Remote session not found."},404);
  if(room.ended_at||room.expires_at<=new Date().toISOString())return json({ended:true,commandSeq:room.command_seq});
  let command=null;try{command=room.command_json?JSON.parse(room.command_json):null}catch{}
  return json({ended:false,commandSeq:Number(room.command_seq||0),command});
}
async function remoteRoomFromBody(body,env){
  const roomId=String(body.roomId||""),key=String(body.key||"");
  if(!/^[A-Za-z0-9_-]{20,40}$/.test(roomId)||key.length<40||key.length>60)return null;
  const room=await env.DB.prepare("SELECT room_id,token_hash,state_json,command_seq,expires_at,ended_at,last_command_at,controller_id FROM remote_rooms WHERE room_id=? LIMIT 1").bind(roomId).first();
  if(!room||room.ended_at||room.expires_at<=new Date().toISOString()||!constantTimeEqual(room.token_hash,await sha256Hex(key)))return null;
  if(body.controllerId && room.controller_id && room.controller_id!==body.controllerId)return null;
  if(!body.controllerId||!room.controller_id)return null;
  return room;
}
async function claimRemoteController(request,env){
  const body=await readBody(request),room=await remoteRoomFromKey(body,env);if(!room)return json({error:"This QR session is invalid or expired."},404);
  const controllerId=String(body.controllerId||"");if(!/^[A-Za-z0-9_-]{20,80}$/.test(controllerId))return json({error:"Invalid controller device."},400);
  await env.DB.prepare("UPDATE remote_rooms SET controller_id=? WHERE room_id=? AND (controller_id IS NULL OR controller_id=?)").bind(controllerId,room.room_id,controllerId).run();
  const claimed=await env.DB.prepare("SELECT controller_id FROM remote_rooms WHERE room_id=? LIMIT 1").bind(room.room_id).first();
  if(!claimed||claimed.controller_id!==controllerId)return json({error:"This game is already connected to another phone."},409);
  return json({ok:true});
}
async function remoteRoomFromKey(body,env){
  const roomId=String(body.roomId||""),key=String(body.key||"");
  if(!/^[A-Za-z0-9_-]{20,40}$/.test(roomId)||key.length<40||key.length>60)return null;
  const room=await env.DB.prepare("SELECT room_id,token_hash,expires_at,ended_at,controller_id FROM remote_rooms WHERE room_id=? LIMIT 1").bind(roomId).first();
  if(!room||room.ended_at||room.expires_at<=new Date().toISOString()||!constantTimeEqual(room.token_hash,await sha256Hex(key)))return null;
  return room;
}
async function getRemoteState(request,env){
  const body=await readBody(request),room=await remoteRoomFromBody(body,env);if(!room)return json({error:"This QR session is invalid or expired."},404);
  let state={};try{state=JSON.parse(room.state_json||"{}")}catch{}
  return json({state,ended:false});
}
async function sendRemoteCommand(request,env){
  const body=await readBody(request),room=await remoteRoomFromBody(body,env);
  if(!room)return json({error:"This QR session is invalid or expired."},404);
  const navigation=["navUp","navDown","navLeft","navRight","navSelect","navBack"];
  const allowed=["next","previous","reveal","award0","award1","pass","pause","powerCall","powerDouble","powerSteal",...navigation];
  if(!allowed.includes(body.action))return json({error:"Unsupported remote action."},400);
  const pointer=false;
  const now=new Date().toISOString();
  const fast=navigation.includes(body.action);
  const cooldown=fast?35:160;
  if(room.last_command_at&&Date.now()-Date.parse(room.last_command_at)<cooldown)return json({error:"Please wait a moment before sending another command."},429);
  await env.DB.prepare("UPDATE remote_rooms SET command_seq=command_seq+1,command_json=?,last_command_at=? WHERE room_id=? AND ended_at IS NULL")
    .bind(JSON.stringify(body.action),now,room.room_id).run();
  return json({ok:true});
}
async function updateRemoteState(request,env){
  const user=await getSessionUser(request,env);if(!user)return json({error:"Host session expired."},401);
  const body=await readBody(request),state=body.state;
  if(!state||typeof state!=="object"||Array.isArray(state))return json({error:"Invalid game state."},400);
  const safe={screen:["board","question","gameover"].includes(state.screen)?state.screen:"board",
    teamNames:Array.isArray(state.teamNames)?state.teamNames.slice(0,2).map(x=>String(x).slice(0,26)):["Team 1","Team 2"],
    scores:Array.isArray(state.scores)?state.scores.slice(0,2).map(x=>Math.max(0,Math.min(999999,Number(x)||0))):[0,0],
    turn:Number(state.turn)===1?1:0,question:String(state.question||"").slice(0,1000),answer:String(state.answer||"").slice(0,1000),
    category:String(state.category||"").slice(0,80),points:Math.max(0,Math.min(10000,Number(state.points)||0)),
    revealed:!!state.revealed,paused:!!state.paused,language:state.language==="ar"?"ar":"en"};
  const result=await env.DB.prepare("UPDATE remote_rooms SET state_json=? WHERE room_id=? AND host_user_id=? AND ended_at IS NULL AND expires_at>?")
    .bind(JSON.stringify(safe),body.roomId,user.id,new Date().toISOString()).run();
  if(!result.meta?.changes)return json({error:"Remote session has ended."},404);
  return json({ok:true});
}
async function endRemoteRoom(request,env){
  const user=await getSessionUser(request,env);if(!user)return json({error:"Host session expired."},401);
  const body=await readBody(request);
  await env.DB.prepare("UPDATE remote_rooms SET ended_at=? WHERE room_id=? AND host_user_id=? AND ended_at IS NULL")
    .bind(new Date().toISOString(),body.roomId,user.id).run();
  return json({ok:true});
}

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
    `SELECT u.id, u.display_name, u.email, u.email_verified, u.created_at, u.verified_at,
            u.birth_date, u.avatar_data_url, u.last_login_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND u.email_verified = 1 AND u.banned_at IS NULL LIMIT 1`,
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
    birthDate: user.birth_date || "",
    avatarDataUrl: user.avatar_data_url || "",
    lastLoginAt: user.last_login_at || null,
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

  const existing = await env.DB.prepare("SELECT id, email_verified, banned_at FROM users WHERE email = ? LIMIT 1").bind(email).first();
  if (existing?.banned_at) return json({ error: "This account is suspended. Contact JALSA support for help." }, 403);
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
    "SELECT id, display_name, email, email_verified, password_hash, banned_at FROM users WHERE email = ? LIMIT 1",
  ).bind(email).first();
  const passwordOk = await verifyPassword(password, user?.password_hash || DUMMY_PASSWORD_HASH);
  if (user?.banned_at) return json({ error: "This account is suspended. Contact JALSA support for help." }, 403);
  if (!user || !user.password_hash || !passwordOk) {
    await recordLoginFailure(email, env);
    return json({ error: "Email or password is incorrect." }, 401);
  }
  if (!user.email_verified) {
    return json({ error: "Your email is not verified yet. Register again with this email to receive a new verification code." }, 403);
  }
  await env.DB.prepare("DELETE FROM login_attempts WHERE email = ?").bind(email).run();
  user.last_login_at = new Date().toISOString();
  await env.DB.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(user.last_login_at, user.id).run();
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
  await env.DB.prepare("UPDATE users SET email_verified = 1, verified_at = ?, updated_at = ?, last_login_at = ? WHERE id = ?")
    .bind(verifiedAt, verifiedAt, verifiedAt, user.id).run();
  user.last_login_at = verifiedAt;
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
  if (!await requireAdmin(request, env)) return json({ error: "Administrator access required." }, 403);
  const result = await env.DB.prepare(
    `SELECT id, display_name AS name, email, email_verified, created_at, verified_at, last_login_at,
            birth_date, updated_at, banned_at, banned_reason,
            CASE WHEN password_hash IS NOT NULL AND password_hash != '' THEN 1 ELSE 0 END AS has_password
     FROM users ORDER BY created_at DESC LIMIT 1000`,
  ).all();
  return json({ users: result.results || [] });
}

async function getAdminUser(request, env, id) {
  if (!await requireAdmin(request, env)) return json({ error: "Administrator access required." }, 403);
  const user = await env.DB.prepare(
    `SELECT id, display_name AS name, email, email_verified, created_at, verified_at, last_login_at,
            birth_date, avatar_data_url, updated_at, banned_at, banned_reason,
            CASE WHEN password_hash IS NOT NULL AND password_hash != '' THEN 1 ELSE 0 END AS has_password
     FROM users WHERE id = ? LIMIT 1`,
  ).bind(id).first();
  if (!user) return json({ error: "User not found." }, 404);
  return json({ user });
}
async function requireAdmin(request, env) {
  const user = await getSessionUser(request, env);
  if (!user || !env.ADMIN_EMAIL || normalizeEmail(user.email) !== normalizeEmail(env.ADMIN_EMAIL)) return null;
  return user;
}
function cleanText(value, max = 2000) { return String(value ?? "").trim().slice(0, max); }
function isStoredMediaUrl(value) {
  return /^\/api\/media\/uploads\/[a-zA-Z0-9/_-]+\.(?:jpe?g|png|webp|gif|mp4|webm|mov|mp3|m4a|aac|ogg|wav)$/i.test(String(value || ""));
}
function validMedia(type, url) {
  const allowed = ["none", "image", "video", "audio"];
  if (!allowed.includes(type || "none")) return false;
  if (!url) return type === "none";
  if (isStoredMediaUrl(url)) return true;
  try { return new URL(url).protocol === "https:"; } catch { return false; }
}
async function deleteStoredMedia(env, value) {
  if (!env.MEDIA || !isStoredMediaUrl(value)) return;
  const key = String(value).slice("/api/media/".length);
  await env.MEDIA.delete(key);
}
async function uploadAdminMedia(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "Administrator access required." }, 403);
  if (!env.MEDIA) return json({ error: "File storage is not connected yet. Configure the JALSA R2 media bucket first." }, 503);
  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file.arrayBuffer !== "function" || !Number.isFinite(file.size)) {
    return json({ error: "Choose a file from your device." }, 400);
  }
  const mime = String(file.type || "").toLowerCase();
  const types = {
    "image/jpeg": ["jpg", 20 * 1024 * 1024],
    "image/png": ["png", 20 * 1024 * 1024],
    "image/webp": ["webp", 20 * 1024 * 1024],
    "image/gif": ["gif", 20 * 1024 * 1024],
    "video/mp4": ["mp4", 35 * 1024 * 1024],
    "video/webm": ["webm", 35 * 1024 * 1024],
    "video/quicktime": ["mov", 35 * 1024 * 1024],
    "audio/mpeg": ["mp3", 25 * 1024 * 1024],
    "audio/mp4": ["m4a", 25 * 1024 * 1024],
    "audio/aac": ["aac", 25 * 1024 * 1024],
    "audio/ogg": ["ogg", 25 * 1024 * 1024],
    "audio/wav": ["wav", 25 * 1024 * 1024],
    "audio/x-wav": ["wav", 25 * 1024 * 1024],
    "audio/webm": ["webm", 25 * 1024 * 1024],
  };
  const spec = types[mime];
  if (!spec) return json({ error: "That file type is not supported. Use JPG, PNG, WebP, GIF, MP4, WebM, MOV, MP3, M4A, AAC, OGG, or WAV." }, 415);
  if (file.size <= 0 || file.size > spec[1]) return json({ error: "This file is too large. Images: 20 MB; video: 35 MB; audio: 25 MB." }, 413);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "/");
  const key = "uploads/" + date + "/" + crypto.randomUUID() + "." + spec[0];
  const bytes = await file.arrayBuffer();
  await env.MEDIA.put(key, bytes, {
    httpMetadata: {
      contentType: mime,
      cacheControl: "public, max-age=31536000, immutable",
      contentDisposition: "inline",
    },
    customMetadata: { uploadedBy: admin.id },
  });
  return json({ ok: true, url: "/api/media/" + key, key, contentType: mime, size: file.size });
}
async function servePublicMedia(request, env, url) {
  if (!env.MEDIA) return new Response("Media storage is not configured.", { status: 503 });
  let key;
  try { key = decodeURIComponent(url.pathname.slice("/api/media/".length)); } catch { return new Response("Not found.", { status: 404 }); }
  if (!/^uploads\/[a-zA-Z0-9/_-]+\.(?:jpe?g|png|webp|gif|mp4|webm|mov|mp3|m4a|aac|ogg|wav)$/i.test(key)) {
    return new Response("Not found.", { status: 404 });
  }
  const object = request.method === "HEAD"
    ? await env.MEDIA.head(key)
    : await env.MEDIA.get(key, request.headers.has("Range") ? { range: request.headers } : {});
  if (!object || (!("body" in object) && request.method !== "HEAD")) return new Response("Not found.", { status: 404 });
  const headers = new Headers();
  if (object.writeHttpMetadata) object.writeHttpMetadata(headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Length", String(object.range?.length ?? object.size));
  let status = 200;
  if (object.range && Number.isFinite(object.range.offset) && Number.isFinite(object.range.length)) {
    headers.set("Content-Range", "bytes " + object.range.offset + "-" + (object.range.offset + object.range.length - 1) + "/" + object.size);
    status = 206;
  }
  return new Response(request.method === "HEAD" ? null : object.body, { status, headers });
}
async function updateProfile(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Please sign in again." }, 401);
  const body = await readBody(request);
  const name = cleanText(body.name, 80);
  const birthDate = cleanText(body.birthDate, 10);
  const avatar = String(body.avatarDataUrl || "");
  if (name.length < 2) return json({ error: "Your name must contain at least 2 characters." }, 400);
  if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return json({ error: "Enter a valid birth date." }, 400);
  if (birthDate && new Date(birthDate + "T00:00:00Z").getTime() > Date.now()) return json({ error: "Birth date cannot be in the future." }, 400);
  if (avatar && !((/^data:image\/(?:jpeg|png|webp);base64,/.test(avatar) && avatar.length <= 360000) || isStoredMediaUrl(avatar))) return json({ error: "Please choose a supported JPG, PNG, or WebP profile image." }, 400);
  await env.DB.prepare("UPDATE users SET display_name = ?, birth_date = ?, avatar_data_url = ?, updated_at = ? WHERE id = ?")
    .bind(name, birthDate || null, avatar || null, new Date().toISOString(), user.id).run();
  return json({ ok: true, user: publicUser({ ...user, display_name: name, birth_date: birthDate, avatar_data_url: avatar }, env) });
}
async function submitFeedback(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Please sign in to send feedback." }, 401);
  const body = await readBody(request), message = cleanText(body.message, 3000);
  if (message.length < 5) return json({ error: "Please write at least 5 characters." }, 400);
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO feedback (id, user_id, email, display_name, message, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'new', ?, ?)")
    .bind(id, user.id, user.email, user.display_name, message, now, now).run();
  return json({ ok: true, message: "Thanks! Your feedback was sent to JALSA." });
}
async function listFeedback(request, env) {
  if (!await requireAdmin(request, env)) return json({ error: "Administrator access required." }, 403);
  const result = await env.DB.prepare("SELECT id, user_id, email, display_name, message, status, created_at FROM feedback ORDER BY created_at DESC LIMIT 500").all();
  return json({ feedback: result.results || [] });
}
async function updateFeedbackStatus(request, env, id) {
  if (!await requireAdmin(request, env)) return json({ error: "Administrator access required." }, 403);
  const body = await readBody(request), status = cleanText(body.status, 16);
  if (!["new", "reviewed", "resolved"].includes(status)) return json({ error: "Invalid feedback status." }, 400);
  await env.DB.prepare("UPDATE feedback SET status = ?, updated_at = ? WHERE id = ?").bind(status, new Date().toISOString(), id).run();
  return json({ ok: true });
}
async function deleteFeedback(request, env, id) {
  if (!await requireAdmin(request, env)) return json({ error: "Administrator access required." }, 403);
  const existing = await env.DB.prepare("SELECT id FROM feedback WHERE id = ? LIMIT 1").bind(id).first();
  if (!existing) return json({ error: "Feedback not found." }, 404);
  await env.DB.prepare("DELETE FROM feedback WHERE id = ?").bind(id).run();
  return json({ ok: true });
}
async function updateAdminUser(request, env, id) {
  const actor = await requireAdmin(request, env);
  if (!actor) return json({ error: "Administrator access required." }, 403);
  const target = await env.DB.prepare("SELECT id, email, email_verified FROM users WHERE id = ? LIMIT 1").bind(id).first();
  if (!target) return json({ error: "User not found." }, 404);
  const body = await readBody(request), action = cleanText(body.action, 24), now = new Date().toISOString();
  if (action === "ban") {
    if (target.id === actor.id) return json({ error: "You cannot ban your own administrator account." }, 403);
    const reason = cleanText(body.reason, 240);
    if (reason.length < 3) return json({ error: "Please provide a reason for banning this user." }, 400);
    await env.DB.prepare("UPDATE users SET banned_at = ?, banned_reason = ?, updated_at = ? WHERE id = ?")
      .bind(now, reason, now, id).run();
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
    return json({ ok: true });
  }
  if (action === "unban") {
    await env.DB.prepare("UPDATE users SET banned_at = NULL, banned_reason = NULL, updated_at = ? WHERE id = ?").bind(now, id).run();
    return json({ ok: true });
  }
  if (action !== "save-details") return json({ error: "Choose a valid account action." }, 400);

  const name = cleanText(body.name, 80);
  const birthDate = cleanText(body.birth_date, 10);
  const avatar = String(body.avatar_data_url || "");
  if (name.length < 2) return json({ error: "A username must contain at least 2 characters." }, 400);
  if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return json({ error: "Enter a valid birth date." }, 400);
  if (birthDate && (!Number.isFinite(new Date(birthDate + "T00:00:00Z").getTime()) || new Date(birthDate + "T00:00:00Z").getTime() > Date.now())) {
    return json({ error: "Birth date cannot be in the future." }, 400);
  }
  if (avatar && !((/^data:image\/(?:jpeg|png|webp);base64,/.test(avatar) && avatar.length <= 360000) || isStoredMediaUrl(avatar))) {
    return json({ error: "Choose a supported profile image." }, 400);
  }
  if (typeof body.email_verified !== "boolean") return json({ error: "Choose whether this account is verified." }, 400);
  if (target.id === actor.id && !body.email_verified) return json({ error: "The administrator account must remain verified." }, 403);
  let passwordHash = null;
  if (body.new_password) {
    if (!validPassword(body.new_password)) return json({ error: "A new password must contain 10 to 128 characters." }, 400);
    passwordHash = await hashPassword(body.new_password);
  }
  const verifiedAt = body.email_verified ? (target.email_verified ? undefined : now) : null;
  await env.DB.prepare(
    `UPDATE users SET display_name = ?, birth_date = ?, avatar_data_url = ?, email_verified = ?,
       verified_at = CASE WHEN ? = 1 THEN COALESCE(verified_at, ?) ELSE NULL END,
       password_hash = COALESCE(?, password_hash), updated_at = ? WHERE id = ?`,
  ).bind(name, birthDate || null, avatar || null, body.email_verified ? 1 : 0,
    body.email_verified ? 1 : 0, verifiedAt || now, passwordHash, now, id).run();

  if (!body.email_verified || passwordHash) {
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
  }
  if (passwordHash || Boolean(body.email_verified) !== Boolean(target.email_verified)) {
    await env.DB.prepare("DELETE FROM login_attempts WHERE email = ?").bind(target.email).run();
  }
  if (!body.email_verified || passwordHash) {
    if (actor.id === id && passwordHash && body.email_verified) {
      const token = await createSession(id, env);
      return json({ ok: true, user: "updated" }, 200, { "Set-Cookie": sessionCookie(token) });
    }
  }
  return json({ ok: true });
}
async function deleteAdminUser(request, env, id) {
  if (!await requireAdmin(request, env)) return json({ error: "Administrator access required." }, 403);
  const target = await env.DB.prepare("SELECT email FROM users WHERE id = ? LIMIT 1").bind(id).first();
  if (!target) return json({ error: "User not found." }, 404);
  if (normalizeEmail(target.email) === normalizeEmail(env.ADMIN_EMAIL)) return json({ error: "The administrator account cannot be deleted." }, 403);
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
  return json({ ok: true });
}
async function getGameContent(request, env) {
  if (!await getSessionUser(request, env)) return json({ error: "Please sign in to play." }, 401);
  const [cats, questions] = await Promise.all([
    env.DB.prepare("SELECT id, name_en, name_ar, image_url, icon, sort_order FROM game_categories ORDER BY sort_order, name_en").all(),
    env.DB.prepare("SELECT * FROM game_questions ORDER BY created_at, id").all()
  ]);
  return json({ categories: cats.results || [], questions: questions.results || [] });
}
async function getAdminContent(request, env) {
  if (!await requireAdmin(request, env)) return json({ error: "Administrator access required." }, 403);
  const [cats, questions] = await Promise.all([
    env.DB.prepare("SELECT id, name_en, name_ar, image_url, icon, sort_order FROM game_categories ORDER BY sort_order, name_en").all(),
    env.DB.prepare("SELECT * FROM game_questions ORDER BY game_type, category_id, difficulty, created_at DESC").all()
  ]);
  return json({ categories: cats.results || [], questions: questions.results || [] });
}
async function seedGameContent(request, env) {
  if (!await requireAdmin(request, env)) return json({ error: "Administrator access required." }, 403);
  const body = await readBody(request), categories = Array.isArray(body.categories) ? body.categories.slice(0, 30) : [], questions = Array.isArray(body.questions) ? body.questions.slice(0, 400) : [];
  const existing = await env.DB.prepare("SELECT COUNT(*) AS count FROM game_questions").first();
  if (Number(existing?.count || 0) > 0) return json({ ok: true, seeded: false });
  if (!categories.length || !questions.length) return json({ error: "Initial game content is missing." }, 400);
  const now = new Date().toISOString(), statements = [];
  for (let i = 0; i < categories.length; i++) {
    const c = categories[i]; if (!/^[a-z0-9_-]{2,48}$/.test(c.id || "") || !cleanText(c.name_en,80)) continue;
    statements.push(env.DB.prepare("INSERT OR IGNORE INTO game_categories (id,name_en,name_ar,image_url,icon,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(c.id, cleanText(c.name_en,80), cleanText(c.name_ar,80), cleanText(c.image_url,500) || null, cleanText(c.icon,12) || "🎯", i, now, now));
  }
  for (const q of questions) {
    const game = q.game_type === "price" ? "price" : "zanko", difficulty = ["easy","medium","hard"].includes(q.difficulty) ? q.difficulty : "medium";
    const mt = q.media_type || "none", mu = cleanText(q.media_url,1000);
    if (game === "zanko" && !categories.some(c => c.id === q.category_id)) continue;
    if (!validMedia(mt, mu)) continue;
    statements.push(env.DB.prepare("INSERT OR IGNORE INTO game_questions (id,game_type,category_id,difficulty,question_en,question_ar,answer_en,answer_ar,media_type,media_url,product_name_en,product_name_ar,product_emoji,price_value,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(cleanText(q.id,80) || crypto.randomUUID(), game, game === "zanko" ? q.category_id : null, difficulty,
        cleanText(q.question_en,1000), cleanText(q.question_ar,1000), cleanText(q.answer_en,1000), cleanText(q.answer_ar,1000),
        mt, mu || null, cleanText(q.product_name_en,160) || null, cleanText(q.product_name_ar,160) || null, cleanText(q.product_emoji,12) || null,
        q.price_value == null ? null : Number(q.price_value), now, now));
  }
  for (let i = 0; i < statements.length; i += 50) {
    await env.DB.batch(statements.slice(i, i + 50));
  }
  return json({ ok: true, seeded: true, inserted: statements.length });
}
function cleanCategory(body, id) {
  const nameEn = cleanText(body.name_en,80), nameAr = cleanText(body.name_ar,80), imageUrl = cleanText(body.image_url,500);
  if (nameEn.length < 2 || nameAr.length < 2) return { error: "Enter category names in English and Arabic." };
  return { id: id || cleanText(body.id,48) || crypto.randomUUID(), name_en: nameEn, name_ar: nameAr, image_url: imageUrl, icon: cleanText(body.icon,12) || "🎯" };
}
async function createCategory(request, env) {
  if (!await requireAdmin(request, env)) return json({ error: "Administrator access required." }, 403);
  const body = await readBody(request), c = cleanCategory(body), id = c.id.toLowerCase().replace(/[^a-z0-9_-]/g,"-"), now = new Date().toISOString();
  if (c.error) return json({ error: c.error }, 400);
  await env.DB.prepare("INSERT INTO game_categories (id,name_en,name_ar,image_url,icon,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM game_categories),?,?)")
    .bind(id,c.name_en,c.name_ar,c.image_url || null,c.icon,now,now).run();
  return json({ ok: true, id });
}
async function updateCategory(request, env, id) {
  if (!await requireAdmin(request, env)) return json({ error: "Administrator access required." }, 403);
  const body = await readBody(request), c = cleanCategory(body,id);
  if (c.error) return json({ error: c.error },400);
  const previous = await env.DB.prepare("SELECT image_url FROM game_categories WHERE id=? LIMIT 1").bind(id).first();
  await env.DB.prepare("UPDATE game_categories SET name_en=?,name_ar=?,image_url=?,icon=?,updated_at=? WHERE id=?")
    .bind(c.name_en,c.name_ar,c.image_url || null,c.icon,new Date().toISOString(),id).run();
  if (previous?.image_url && previous.image_url !== c.image_url) await deleteStoredMedia(env, previous.image_url);
  return json({ok:true});
}
async function deleteCategory(request, env, id) {
  if (!await requireAdmin(request, env)) return json({ error: "Administrator access required." }, 403);
  const previous = await env.DB.prepare("SELECT image_url FROM game_categories WHERE id=? LIMIT 1").bind(id).first();
  await env.DB.prepare("DELETE FROM game_categories WHERE id=?").bind(id).run();
  if (previous?.image_url) await deleteStoredMedia(env, previous.image_url);
  return json({ok:true});
}
function cleanQuestion(body, id) {
  const game = body.game_type === "price" ? "price" : "zanko", difficulty = ["easy","medium","hard"].includes(body.difficulty) ? body.difficulty : "medium";
  const mediaType = body.media_type || "none", mediaUrl = cleanText(body.media_url,1000);
  if (!validMedia(mediaType,mediaUrl)) return {error:"Choose a valid media type and an HTTPS media URL."};
  if (game === "zanko") {
    const q=cleanText(body.question_en,1000), a=cleanText(body.answer_en,1000);
    if (!body.category_id || q.length<3 || !a.length) return {error:"Choose a category and enter the English question and answer."};
    return {id:id || crypto.randomUUID(),game_type:game,category_id:cleanText(body.category_id,48),difficulty,question_en:q,question_ar:cleanText(body.question_ar,1000),answer_en:a,answer_ar:cleanText(body.answer_ar,1000),media_type:mediaType,media_url:mediaUrl || null,product_name_en:null,product_name_ar:null,product_emoji:null,price_value:null};
  }
  const name=cleanText(body.product_name_en,160), price=Number(body.price_value);
  if (name.length<2 || !Number.isFinite(price) || price<=0) return {error:"Enter a product name and a valid price above zero in USD."};
  if (mediaType === "none" || !mediaUrl) return {error:"Add a real product photo or another media file before saving."};
  return {id:id || crypto.randomUUID(),game_type:game,category_id:null,difficulty,question_en:"",question_ar:"",answer_en:"",answer_ar:"",media_type:mediaType,media_url:mediaUrl,product_name_en:name,product_name_ar:cleanText(body.product_name_ar,160),product_emoji:null,price_value:price};
}
async function createQuestion(request, env) {
  if (!await requireAdmin(request, env)) return json({error:"Administrator access required."},403);
  const body=await readBody(request),q=cleanQuestion(body);
  if(q.error)return json({error:q.error},400);
  if(q.game_type==="zanko" && !await env.DB.prepare("SELECT id FROM game_categories WHERE id=? LIMIT 1").bind(q.category_id).first())return json({error:"Choose an existing category."},400);
  const now=new Date().toISOString();
  await env.DB.prepare("INSERT INTO game_questions (id,game_type,category_id,difficulty,question_en,question_ar,answer_en,answer_ar,media_type,media_url,product_name_en,product_name_ar,product_emoji,price_value,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(q.id,q.game_type,q.category_id,q.difficulty,q.question_en,q.question_ar,q.answer_en,q.answer_ar,q.media_type,q.media_url,q.product_name_en,q.product_name_ar,q.product_emoji,q.price_value,now,now).run();
  return json({ok:true,id:q.id});
}
async function updateQuestion(request, env, id) {
  if (!await requireAdmin(request, env)) return json({error:"Administrator access required."},403);
  const body=await readBody(request),q=cleanQuestion(body,id);
  if(q.error)return json({error:q.error},400);
  if(q.game_type==="zanko" && !await env.DB.prepare("SELECT id FROM game_categories WHERE id=? LIMIT 1").bind(q.category_id).first())return json({error:"Choose an existing category."},400);
  const previous = await env.DB.prepare("SELECT media_url FROM game_questions WHERE id=? LIMIT 1").bind(id).first();
  await env.DB.prepare("UPDATE game_questions SET game_type=?,category_id=?,difficulty=?,question_en=?,question_ar=?,answer_en=?,answer_ar=?,media_type=?,media_url=?,product_name_en=?,product_name_ar=?,product_emoji=?,price_value=?,updated_at=? WHERE id=?")
    .bind(q.game_type,q.category_id,q.difficulty,q.question_en,q.question_ar,q.answer_en,q.answer_ar,q.media_type,q.media_url,q.product_name_en,q.product_name_ar,q.product_emoji,q.price_value,new Date().toISOString(),id).run();
  if (previous?.media_url && previous.media_url !== q.media_url) await deleteStoredMedia(env, previous.media_url);
  return json({ok:true});
}
async function deleteQuestion(request, env, id) {
  if (!await requireAdmin(request, env)) return json({error:"Administrator access required."},403);
  const previous = await env.DB.prepare("SELECT media_url FROM game_questions WHERE id=? LIMIT 1").bind(id).first();
  await env.DB.prepare("DELETE FROM game_questions WHERE id=?").bind(id).run();
  if (previous?.media_url) await deleteStoredMedia(env, previous.media_url);
  return json({ok:true});
}

