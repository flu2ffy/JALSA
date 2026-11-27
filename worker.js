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

      if (url.pathname === "/api/paddle/webhook" && request.method === "POST") return await handlePaddleWebhook(request, env);
      if (url.pathname === "/api/paddle/config" && request.method === "GET") return await getPaddleCheckoutConfig(request, env);
      if (url.pathname === "/api/paddle/portal" && request.method === "POST") return await createPaddlePortalSession(request, env);
      if (url.pathname === "/api/stripe/webhook" && request.method === "POST") return await handleStripeWebhook(request, env);
      if (url.pathname === "/api/billing/checkout" && request.method === "POST") return await createBillingCheckout(request, env, url);
      if (url.pathname === "/api/billing/portal" && request.method === "POST") return await createBillingPortal(request, env, url);
      if (url.pathname === "/api/billing/cancel" && request.method === "POST") return await cancelBillingSubscription(request, env);
      if (url.pathname === "/api/subscription-status" && request.method === "GET") return await getSubscriptionStatus(request, env);
      if (url.pathname === "/api/admin/subscription-settings" && request.method === "GET") return await getAdminSubscriptionSettings(request, env);
      if (url.pathname === "/api/admin/subscription-settings" && request.method === "PATCH") return await updateAdminSubscriptionSettings(request, env);
      if (url.pathname === "/api/game-access/start" && request.method === "POST") return await startGameAccess(request, env);
      const contentGameId = url.pathname === "/api/game-content"
        ? (["zanko", "price"].includes(url.searchParams.get("gameId")) ? url.searchParams.get("gameId") : "zanko")
        : null;
      const protectedGameId = contentGameId || (url.pathname === "/api/remote/create" ? "zanko"
        : url.pathname === "/api/insight/create" ? "insight"
        : url.pathname === "/api/imposter/create" ? "imposter"
        : url.pathname === "/api/mafia/create" ? "mafia"
        : url.pathname === "/api/kharj/create" ? "kharj" : null);
      if (protectedGameId) {
        const denied = await requireSubscriptionAccess(request, env, protectedGameId);
        if (denied) return denied;
      }
      if (url.pathname === "/api/game-availability" && request.method === "GET") return await getGameAvailability(env);
      if (url.pathname === "/api/admin/game-availability" && request.method === "GET") return await getAdminGameAvailability(request, env);
      if (url.pathname.startsWith("/api/admin/game-availability/") && request.method === "PATCH") return await updateGameAvailability(request, env, decodeURIComponent(url.pathname.split("/").pop()));
      if (url.pathname.startsWith("/api/insight/") || url.pathname.startsWith("/api/imposter/") || url.pathname.startsWith("/api/mafia/") || url.pathname.startsWith("/api/kharj/")) {
        const gameId = url.pathname.startsWith("/api/insight/") ? "insight" : url.pathname.startsWith("/api/imposter/") ? "imposter" : url.pathname.startsWith("/api/mafia/") ? "mafia" : "kharj";
        const availability = await readGameAvailability(env, gameId);
        if (!availability.enabled) return json({ error: "This game is temporarily unavailable. Please check back later." }, 423);
      }
      if (url.pathname === "/api/remote/create" && request.method === "POST") return await createRemoteRoom(request, env);
      if (url.pathname === "/api/remote/poll" && request.method === "GET") return await pollRemoteHost(request, env, url);
      if (url.pathname === "/api/remote/claim" && request.method === "POST") return await claimRemoteController(request, env);
      if (url.pathname === "/api/remote/read" && request.method === "POST") return await getRemoteState(request, env);
      if (url.pathname === "/api/remote/state" && request.method === "POST") return await updateRemoteState(request, env);
      if (url.pathname === "/api/remote/command" && request.method === "POST") return await sendRemoteCommand(request, env);
      if (url.pathname === "/api/remote/end" && request.method === "POST") return await endRemoteRoom(request, env);
      if (url.pathname === "/api/insight/create" && request.method === "POST") return await createInsightRoom(request, env);
      if (url.pathname === "/api/insight/join" && request.method === "POST") return await joinInsightRoom(request, env);
      if (url.pathname === "/api/insight/state" && request.method === "GET") return await getInsightState(request, env, url);
      if (url.pathname === "/api/insight/action" && request.method === "POST") return await insightAction(request, env);
      if (url.pathname === "/api/me" && request.method === "GET") {
        const cookiePresent = !!cookieValue(request, COOKIE_NAME);
        const user = await getSessionUser(request, env);
        return json({ user: await publicUserWithSubscription(user, env) }, 200, {
          "Cache-Control": "private, no-store, max-age=0",
          "Vary": "Cookie",
          // Safe diagnostics for the preview: booleans only, never expose the token.
          "X-JALSA-Session-Cookie": cookiePresent ? "present" : "missing",
          "X-JALSA-Session-Valid": user ? "yes" : "no",
        });
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
      if (url.pathname === "/api/faq-questions" && request.method === "POST") return await submitFaqQuestion(request, env);
      if (url.pathname === "/api/admin/faq-questions" && request.method === "GET") return await listFaqQuestions(request, env);
      if (url.pathname === "/api/game-content" && request.method === "GET") return await getGameContent(request, env);
      if (url.pathname === "/api/admin/content" && request.method === "GET") return await getAdminContent(request, env);
      if (url.pathname === "/api/admin/content/seed" && request.method === "POST") return await seedGameContent(request, env);
      if (url.pathname === "/api/admin/categories" && request.method === "POST") return await createCategory(request, env);
      if (url.pathname === "/api/admin/questions" && request.method === "POST") return await createQuestion(request, env);
      if (url.pathname === "/api/admin/feedback" && request.method === "GET") return await listFeedback(request, env);
      if (url.pathname === "/api/admin/imposter-words" && request.method === "GET") return await listImposterWords(request, env);
      if (url.pathname === "/api/admin/imposter-words" && request.method === "POST") return await saveImposterWord(request, env);
      if (url.pathname === "/api/admin/kharj-words" && request.method === "GET") return await listKharjWords(request, env);
      if (url.pathname === "/api/admin/kharj-words" && request.method === "POST") return await saveKharjWord(request, env);
      if (url.pathname === "/api/imposter/create" && request.method === "POST") return await createImposterRoom(request, env);
      if (url.pathname === "/api/imposter/join" && request.method === "POST") return await joinImposterRoom(request, env);
      if (url.pathname === "/api/imposter/host-state" && request.method === "GET") return await getImposterHostState(request, env, url);
      if (url.pathname === "/api/imposter/player-state" && request.method === "GET") return await getImposterPlayerState(request, env, url);
      if (url.pathname === "/api/imposter/host-action" && request.method === "POST") return await imposterHostAction(request, env);
      if (url.pathname === "/api/imposter/player-action" && request.method === "POST") return await imposterPlayerAction(request, env);
      if (url.pathname === "/api/mafia/create" && request.method === "POST") return await createMafiaRoom(request, env);
      if (url.pathname === "/api/mafia/join" && request.method === "POST") return await joinMafiaRoom(request, env);
      if (url.pathname === "/api/mafia/host-state" && request.method === "GET") return await getMafiaHostState(request, env, url);
      if (url.pathname === "/api/mafia/player-state" && request.method === "GET") return await getMafiaPlayerState(request, env, url);
      if (url.pathname === "/api/mafia/host-action" && request.method === "POST") return await mafiaHostAction(request, env);
      if (url.pathname === "/api/mafia/player-action" && request.method === "POST") return await mafiaPlayerAction(request, env);
      if (url.pathname === "/api/kharj/create" && request.method === "POST") return await createKharjRoom(request, env);
      if (url.pathname === "/api/kharj/host-state" && request.method === "GET") return await getKharjHostState(request, env, url);
      if (url.pathname === "/api/kharj/controller-state" && request.method === "GET") return await getKharjControllerState(request, env, url);
      if (url.pathname === "/api/kharj/controller-action" && request.method === "POST") return await kharjControllerAction(request, env);
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
        if (adminParts[3] === "faq-questions" && request.method === "PATCH") return await updateFaqQuestionStatus(request, env, itemId);
        if (adminParts[3] === "faq-questions" && request.method === "DELETE") return await deleteFaqQuestion(request, env, itemId);
        if (adminParts[3] === "imposter-words" && request.method === "PATCH") return await updateImposterWord(request, env, itemId);
        if (adminParts[3] === "imposter-words" && request.method === "DELETE") return await deleteImposterWord(request, env, itemId);
        if (adminParts[3] === "kharj-words" && request.method === "PATCH") return await updateKharjWord(request, env, itemId);
        if (adminParts[3] === "kharj-words" && request.method === "DELETE") return await deleteKharjWord(request, env, itemId);
      }
      return json({ error: "Not found." }, 404);
    } catch (error) {
      console.error("JALSA API error:", error?.message || "unknown");
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
  },
};






const GAME_AVAILABILITY = [
  { id: "zanko", name: "Zanko" },
  { id: "price", name: "Price Game" },
  { id: "imposter", name: "Imposter" },
  { id: "insight", name: "INSIGHT" },
  { id: "mafia", name: "Mafia" },
  { id: "kharj", name: "Kharj Al Jalsa" }
];
const subscriptionSchemaPromises = new WeakMap();
const zankoExtendedSchemaPromises = new WeakMap();
async function ensureZankoExtendedSchema(env) {
  const db = env?.DB;
  if (!db) throw new Error("JALSA database binding is not configured.");
  let pending = zankoExtendedSchemaPromises.get(db);
  if (!pending) {
    pending = (async () => {
      const [categoryInfo, questionInfo] = await Promise.all([
        db.prepare("PRAGMA table_info(game_categories)").all(),
        db.prepare("PRAGMA table_info(game_questions)").all()
      ]);
      const categoryColumns = new Set((categoryInfo.results || []).map(column => column.name));
      const questionColumns = new Set((questionInfo.results || []).map(column => column.name));
      const statements = [];
      if (!categoryColumns.has("group_en")) statements.push(db.prepare("ALTER TABLE game_categories ADD COLUMN group_en TEXT NOT NULL DEFAULT ''"));
      if (!categoryColumns.has("group_ar")) statements.push(db.prepare("ALTER TABLE game_categories ADD COLUMN group_ar TEXT NOT NULL DEFAULT ''"));
      if (!questionColumns.has("answer_media_type")) statements.push(db.prepare("ALTER TABLE game_questions ADD COLUMN answer_media_type TEXT NOT NULL DEFAULT 'none'"));
      if (!questionColumns.has("answer_media_url")) statements.push(db.prepare("ALTER TABLE game_questions ADD COLUMN answer_media_url TEXT"));
      if (statements.length) await db.batch(statements);
      await db.batch([
        db.prepare("UPDATE game_categories SET group_en=CASE WHEN id IN ('cartoon','disney') THEN 'Movies' WHEN id IN ('biology','physics','math') THEN 'Science' WHEN id='music' THEN 'Music' ELSE 'Other' END WHERE COALESCE(group_en,'')=''"),
        db.prepare("UPDATE game_categories SET group_ar=CASE WHEN id IN ('cartoon','disney') THEN 'أفلام' WHEN id IN ('biology','physics','math') THEN 'العلوم' WHEN id='music' THEN 'الموسيقى' ELSE 'أخرى' END WHERE COALESCE(group_ar,'')=''")
      ]);
    })();
    zankoExtendedSchemaPromises.set(db, pending);
  }
  try { await pending; }
  catch (error) { zankoExtendedSchemaPromises.delete(db); throw error; }
}
async function ensureSubscriptionSchema(env) {
  const db = env?.DB;
  if (!db) throw new Error("JALSA database binding is not configured.");
  let pending = subscriptionSchemaPromises.get(db);
  if (!pending) {
    pending = (async () => {
      // D1 batch keeps first-time schema setup to one database round trip.
      await db.batch([
        db.prepare("CREATE TABLE IF NOT EXISTS jalsa_settings (setting_key TEXT PRIMARY KEY NOT NULL, setting_value TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT)"),
        db.prepare("INSERT OR IGNORE INTO jalsa_settings (setting_key, setting_value, updated_at) VALUES ('subscriptions_enabled', '0', ?)").bind(new Date().toISOString()),
        db.prepare(`CREATE TABLE IF NOT EXISTS user_subscriptions (
          user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          plan_code TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
          starts_at TEXT NOT NULL,
          expires_at TEXT,
          granted_by TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`),
        db.prepare("CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status_expiry ON user_subscriptions(status, expires_at)"),
        db.prepare(`CREATE TABLE IF NOT EXISTS free_game_sessions (
          user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          game_id TEXT NOT NULL CHECK (game_id IN ('zanko','price','imposter','insight','mafia','kharj')),
          session_id TEXT NOT NULL,
          started_at TEXT NOT NULL
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS billing_subscriptions (
          user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          stripe_customer_id TEXT,
          stripe_subscription_id TEXT UNIQUE,
          stripe_price_id TEXT,
          status TEXT NOT NULL,
          current_period_start TEXT,
          current_period_end TEXT,
          cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
          last_event_created INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL
        )`),
        db.prepare("CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_status_end ON billing_subscriptions(status, current_period_end)"),
        db.prepare("CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_customer ON billing_subscriptions(stripe_customer_id)"),
        db.prepare(`CREATE TABLE IF NOT EXISTS paddle_subscriptions (
          user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          paddle_customer_id TEXT,
          paddle_subscription_id TEXT UNIQUE,
          paddle_price_id TEXT,
          status TEXT NOT NULL,
          current_period_start TEXT,
          current_period_end TEXT,
          cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
          last_event_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`),
        db.prepare("CREATE INDEX IF NOT EXISTS idx_paddle_subscriptions_customer ON paddle_subscriptions(paddle_customer_id)"),
        db.prepare("CREATE INDEX IF NOT EXISTS idx_paddle_subscriptions_status_end ON paddle_subscriptions(status, current_period_end)"),
        db.prepare("CREATE TABLE IF NOT EXISTS paddle_webhook_events (event_id TEXT PRIMARY KEY NOT NULL, received_at TEXT NOT NULL)")
      ]);
      const freeGameTable = await db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='free_game_sessions' LIMIT 1").first();
      if (freeGameTable?.sql && !freeGameTable.sql.includes("'kharj'")) {
        await db.batch([
          db.prepare("ALTER TABLE free_game_sessions RENAME TO free_game_sessions_legacy"),
          db.prepare("CREATE TABLE free_game_sessions (user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE, game_id TEXT NOT NULL CHECK (game_id IN ('zanko','price','imposter','insight','mafia','kharj')), session_id TEXT NOT NULL, started_at TEXT NOT NULL)"),
          db.prepare("INSERT INTO free_game_sessions (user_id, game_id, session_id, started_at) SELECT user_id, game_id, session_id, started_at FROM free_game_sessions_legacy"),
          db.prepare("DROP TABLE free_game_sessions_legacy")
        ]);
      }
    })();
    subscriptionSchemaPromises.set(db, pending);
  }
  try {
    await pending;
  } catch (error) {
    subscriptionSchemaPromises.delete(db);
    throw error;
  }
}
function addSubscriptionMonths(source, months) {
  const date = new Date(source);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date;
}
async function readSubscriptionSettings(env) {
  await ensureSubscriptionSchema(env);
  const row = await env.DB.prepare("SELECT setting_value FROM jalsa_settings WHERE setting_key='subscriptions_enabled' LIMIT 1").first();
  return { enabled: row?.setting_value === "1" };
}
async function subscriptionAccessForUser(user, env) {
  if (!user) {
    const settings = await readSubscriptionSettings(env);
    return { enabled: settings.enabled, active: false, allowed: false, plan: null, expiresAt: null, isAdmin: false };
  }

  await ensureSubscriptionSchema(env);
  const isAdmin = !!env.ADMIN_EMAIL && normalizeEmail(user.email) === normalizeEmail(env.ADMIN_EMAIL);

  // Read the global switch and all three entitlement sources in one D1 query.
  // This is the data needed by /api/me to display the Premium badge.
  const row = await env.DB.prepare(`
    SELECT
      settings.setting_value AS subscriptions_enabled,
      user_grant.plan_code AS grant_plan_code,
      user_grant.status AS grant_status,
      user_grant.starts_at AS grant_starts_at,
      user_grant.expires_at AS grant_expires_at,
      stripe.stripe_customer_id AS stripe_customer_id,
      stripe.status AS stripe_status,
      stripe.current_period_start AS stripe_period_start,
      stripe.current_period_end AS stripe_period_end,
      stripe.cancel_at_period_end AS stripe_cancel_at_period_end,
      paddle.paddle_customer_id AS paddle_customer_id,
      paddle.status AS paddle_status,
      paddle.current_period_start AS paddle_period_start,
      paddle.current_period_end AS paddle_period_end,
      paddle.cancel_at_period_end AS paddle_cancel_at_period_end
    FROM (SELECT ? AS user_id) AS account
    LEFT JOIN jalsa_settings AS settings
      ON settings.setting_key='subscriptions_enabled'
    LEFT JOIN user_subscriptions AS user_grant
      ON user_grant.user_id=account.user_id
    LEFT JOIN billing_subscriptions AS stripe
      ON stripe.user_id=account.user_id
    LEFT JOIN paddle_subscriptions AS paddle
      ON paddle.user_id=account.user_id
    LIMIT 1
  `).bind(user.id).first();

  const now = new Date().toISOString();
  const grantActive = !!row?.grant_status && row.grant_status === "active" &&
    (!row.grant_expires_at || row.grant_expires_at > now);
  const paddleActive = !!row?.paddle_status && ["active", "trialing"].includes(row.paddle_status) &&
    (!row.paddle_period_end || row.paddle_period_end > now);
  const stripeActive = !!row?.stripe_status && ["active", "trialing"].includes(row.stripe_status) &&
    (!row.stripe_period_end || row.stripe_period_end > now);
  const active = grantActive || paddleActive || stripeActive;
  const source = grantActive ? "admin-grant" : paddleActive ? "paddle" : stripeActive ? "stripe" : null;

  const hasPaddleRecord = !!row?.paddle_status;
  const usePaddleBilling = paddleActive || (!stripeActive && hasPaddleRecord);
  const billingStart = usePaddleBilling ? row?.paddle_period_start : row?.stripe_period_start;
  const billingEnd = usePaddleBilling ? row?.paddle_period_end : row?.stripe_period_end;
  const billingStatus = usePaddleBilling ? row?.paddle_status : row?.stripe_status;
  const cancelAtPeriodEnd = usePaddleBilling ? row?.paddle_cancel_at_period_end : row?.stripe_cancel_at_period_end;

  return {
    enabled: row?.subscriptions_enabled === "1",
    active,
    allowed: row?.subscriptions_enabled !== "1" || active || isAdmin,
    source,
    plan: grantActive ? row.grant_plan_code : (paddleActive || stripeActive) ? "monthly_auto_renew" : null,
    startsAt: grantActive ? row.grant_starts_at : billingStart || null,
    expiresAt: grantActive ? row.grant_expires_at : billingEnd || null,
    billingStatus: billingStatus || null,
    cancelAtPeriodEnd: !!Number(cancelAtPeriodEnd || 0),
    hasStripeCustomer: !!row?.stripe_customer_id,
    hasPaddleCustomer: !!row?.paddle_customer_id,
    isAdmin
  };
}
const FREE_GAME_SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const VALID_FREE_GAME_IDS = new Set(["zanko", "price", "imposter", "insight", "mafia", "kharj"]);
async function freeGameSessionForUser(userId, env) {
  await ensureSubscriptionSchema(env);
  return await env.DB.prepare("SELECT game_id, session_id, started_at FROM free_game_sessions WHERE user_id=? LIMIT 1").bind(userId).first();
}
async function startGameAccess(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Please sign in to play.", code: "LOGIN_REQUIRED" }, 401);
  const body = await readBody(request);
  const gameId = String(body.gameId || "");
  const sessionId = String(body.sessionId || "");
  if (!VALID_FREE_GAME_IDS.has(gameId)) return json({ error: "Choose a valid JALSA game.", code: "INVALID_GAME" }, 400);
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(sessionId)) return json({ error: "Refresh the page and try again.", code: "INVALID_GAME_SESSION" }, 400);
  await ensureSubscriptionSchema(env);
  const access = await subscriptionAccessForUser(user, env);
  if (access.allowed) return json({ allowed: true, freeGame: false, ...access });
  const existing = await freeGameSessionForUser(user.id, env);
  const startedAtMs = existing?.started_at ? Date.parse(existing.started_at) : 0;
  const sessionStillActive = startedAtMs > 0 && Date.now() - startedAtMs <= FREE_GAME_SESSION_MAX_AGE_MS;
  if (existing) {
    if (existing.game_id === gameId && existing.session_id === sessionId && sessionStillActive) {
      return json({ allowed: true, freeGame: true, freeGameUsed: true, gameId, startedAt: existing.started_at });
    }
    return json({
      allowed: false, freeGame: false, freeGameUsed: true,
      error: "Your one free JALSA game has already been used. Subscribe to JALSA Premium to play another game.",
      code: "SUBSCRIPTION_REQUIRED", gameId: existing.game_id
    }, 402);
  }
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT OR IGNORE INTO free_game_sessions (user_id, game_id, session_id, started_at) VALUES (?, ?, ?, ?)")
    .bind(user.id, gameId, sessionId, now).run();
  const saved = await freeGameSessionForUser(user.id, env);
  if (saved?.game_id === gameId && saved?.session_id === sessionId) {
    return json({ allowed: true, freeGame: true, freeGameUsed: true, gameId, startedAt: saved.started_at });
  }
  return json({
    allowed: false, freeGame: false, freeGameUsed: true,
    error: "Your one free JALSA game has already been used. Subscribe to JALSA Premium to play another game.",
    code: "SUBSCRIPTION_REQUIRED", gameId: saved?.game_id || null
  }, 402);
}
async function getSubscriptionStatus(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Please sign in to check subscription access.", code: "LOGIN_REQUIRED" }, 401);
  await ensureSubscriptionSchema(env);
  const access = await subscriptionAccessForUser(user, env);
  const freeGame = await freeGameSessionForUser(user.id, env);
  return json({ ...access, freeGameUsed: !!freeGame, freeGameId: freeGame?.game_id || null }, 200, { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie" });
}
async function requireSubscriptionAccess(request, env, gameId) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Please sign in to play.", code: "LOGIN_REQUIRED" }, 401);
  await ensureSubscriptionSchema(env);
  const access = await subscriptionAccessForUser(user, env);
  if (access.allowed) return null;
  const sessionId = request.headers.get("X-JALSA-Free-Game-Session") || "";
  if (VALID_FREE_GAME_IDS.has(gameId) && sessionId) {
    const freeGame = await freeGameSessionForUser(user.id, env);
    const startedAtMs = freeGame?.started_at ? Date.parse(freeGame.started_at) : 0;
    if (freeGame?.game_id === gameId && freeGame?.session_id === sessionId &&
        startedAtMs > 0 && Date.now() - startedAtMs <= FREE_GAME_SESSION_MAX_AGE_MS) return null;
  }
  return json({
    error: "Your one free JALSA game has already been used. Subscribe to JALSA Premium to play another game.",
    code: "SUBSCRIPTION_REQUIRED", freeGameUsed: true
  }, 402);
}
async function getAdminSubscriptionSettings(request, env) {
  if (!await requireAdmin(request, env)) return json({ error: "Administrator access required." }, 403);
  const settings = await readSubscriptionSettings(env);
  const now = new Date().toISOString();
  const [grants, paid] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status='active' AND (expires_at IS NULL OR expires_at > ?) THEN 1 ELSE 0 END) AS active FROM user_subscriptions").bind(now).first(),
    env.DB.prepare(`SELECT COUNT(DISTINCT user_id) AS total,
      COUNT(DISTINCT CASE WHEN status IN ('active','trialing') AND (current_period_end IS NULL OR current_period_end > ?) THEN user_id END) AS active
      FROM (
        SELECT user_id, status, current_period_end FROM billing_subscriptions WHERE stripe_subscription_id IS NOT NULL
        UNION ALL
        SELECT user_id, status, current_period_end FROM paddle_subscriptions WHERE paddle_subscription_id IS NOT NULL
      )`).bind(now).first()
  ]);
  return json({
    enabled: settings.enabled,
    totalGranted: Number(grants?.total || 0),
    activeGranted: Number(grants?.active || 0),
    totalPaid: Number(paid?.total || 0),
    activePaid: Number(paid?.active || 0),
    paymentConfigured: !!(env.PADDLE_API_KEY && env.PADDLE_CLIENT_TOKEN && env.PADDLE_PRICE_ID && env.PADDLE_WEBHOOK_SECRET),
    paymentProvider: "paddle"
  });
}
async function updateAdminSubscriptionSettings(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "Administrator access required." }, 403);
  const body = await readBody(request);
  if (typeof body.enabled !== "boolean") return json({ error: "Choose whether subscriptions are enabled." }, 400);
  await ensureSubscriptionSchema(env);
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE jalsa_settings SET setting_value=?, updated_at=?, updated_by=? WHERE setting_key='subscriptions_enabled'")
    .bind(body.enabled ? "1" : "0", now, admin.id).run();
  return json({ ok: true, enabled: body.enabled });
}

function paddleApiBase(env) {
  return env.PADDLE_ENVIRONMENT === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
}
async function paddleApiRequest(env, endpoint, body) {
  if (!env.PADDLE_API_KEY) throw new Error("Paddle API key is not configured for this environment.");
  const response = await fetch(paddleApiBase(env) + endpoint, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.PADDLE_API_KEY,
      "Content-Type": "application/json",
      "Paddle-Version": "1"
    },
    body: JSON.stringify(body || {})
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    const message = data?.error?.detail || data?.error?.message || data?.errors?.[0]?.detail || "Paddle could not complete the billing request.";
    throw new Error(String(message).slice(0, 300));
  }
  return data;
}
async function getPaddleCheckoutConfig(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Please sign in before subscribing.", code: "LOGIN_REQUIRED" }, 401);
  const settings = await readSubscriptionSettings(env);
  if (!settings.enabled) return json({ error: "Subscriptions are currently disabled. JALSA is free for everyone.", code: "SUBSCRIPTIONS_DISABLED" }, 409);
  if (!env.PADDLE_CLIENT_TOKEN || !env.PADDLE_PRICE_ID || !env.PADDLE_API_KEY || !env.PADDLE_WEBHOOK_SECRET) {
    const environment = env.PADDLE_ENVIRONMENT === "sandbox" ? "Sandbox" : "Production";
    return json({ error: "Paddle " + environment + " checkout and webhook are not fully configured yet.", code: "PADDLE_NOT_CONFIGURED" }, 503);
  }
  const access = await subscriptionAccessForUser(user, env);
  if (access.active) return json({ error: "Your account already has active access.", code: "ALREADY_HAS_ACCESS" }, 409);
  return json({
    clientToken: env.PADDLE_CLIENT_TOKEN,
    priceId: env.PADDLE_PRICE_ID,
    environment: env.PADDLE_ENVIRONMENT === "sandbox" ? "sandbox" : "production"
  }, 200, { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie" });
}
async function createPaddlePortalSession(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Please sign in to manage billing.", code: "LOGIN_REQUIRED" }, 401);
  await ensureSubscriptionSchema(env);
  const billing = await env.DB.prepare(
    "SELECT paddle_customer_id, paddle_subscription_id FROM paddle_subscriptions WHERE user_id=? LIMIT 1"
  ).bind(user.id).first();
  if (!billing?.paddle_customer_id) return json({ error: "No Paddle subscription is linked to this account.", code: "NO_PADDLE_CUSTOMER" }, 404);
  try {
    const body = billing.paddle_subscription_id ? { subscription_ids: [billing.paddle_subscription_id] } : {};
    const response = await paddleApiRequest(env, "/customers/" + encodeURIComponent(billing.paddle_customer_id) + "/portal-sessions", body);
    const portalUrl = response?.data?.urls?.general?.overview;
    if (!portalUrl) return json({ error: "Paddle did not return a customer portal URL.", code: "PADDLE_PORTAL_URL_MISSING" }, 502);
    return json({ ok: true, url: portalUrl });
  } catch (error) {
    return json({ error: "Paddle customer portal could not open: " + String(error?.message || "Unknown error").slice(0, 240), code: "PADDLE_PORTAL_FAILED" }, 502);
  }
}
function hexBuffer(bytes) {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}
async function verifyPaddleWebhookSignature(payload, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;
  const fields = signatureHeader.split(";").map(part => part.trim());
  const timestamp = fields.find(part => part.startsWith("ts="))?.slice(3) || "";
  const signatures = fields.filter(part => part.startsWith("h1=")).map(part => part.slice(3));
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > 300 || !signatures.length) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(timestamp + ":" + payload));
  const expected = hexBuffer(signed);
  return signatures.some(signature => constantTimeEqual(signature.toLowerCase(), expected));
}
async function savePaddleSubscriptionEvent(env, event) {
  await ensureSubscriptionSchema(env);
  const data = event?.data || {};
  const eventId = String(event?.event_id || event?.notification_id || "");
  const eventType = String(event?.event_type || "");
  const occurredAt = String(event?.occurred_at || new Date().toISOString());
  if (!eventId || !eventType.startsWith("subscription.") || !data.id) return { ignored: true };
  const previous = await env.DB.prepare(
    "SELECT user_id, current_period_end, last_event_at FROM paddle_subscriptions WHERE paddle_subscription_id=? LIMIT 1"
  ).bind(String(data.id)).first();
  let userId = String(data.custom_data?.jalsa_user_id || data.custom_data?.jalsaUserId || previous?.user_id || "");
  if (!userId && data.customer_id) {
    const existing = await env.DB.prepare("SELECT user_id FROM paddle_subscriptions WHERE paddle_customer_id=? LIMIT 1").bind(String(data.customer_id)).first();
    userId = String(existing?.user_id || "");
  }
  if (!userId) {
    console.warn("Paddle subscription event has no JALSA user mapping; expected custom_data.jalsa_user_id.");
    return { ignored: true, reason: "missing_user_mapping" };
  }
  if (previous?.last_event_at && occurredAt < previous.last_event_at) return { ignored: true, reason: "stale_event" };
  const eventStatus = eventType === "subscription.canceled" ? "canceled"
    : eventType === "subscription.past_due" ? "past_due"
    : eventType === "subscription.paused" ? "paused"
    : eventType === "subscription.activated" || eventType === "subscription.resumed" ? "active"
    : eventType === "subscription.trialing" ? "trialing"
    : String(data.status || "inactive");
  const currentPeriod = data.current_billing_period || {};
  const periodStart = currentPeriod.starts_at || data.started_at || null;
  const periodEnd = currentPeriod.ends_at || data.next_billed_at || previous?.current_period_end || null;
  const firstItem = Array.isArray(data.items) ? data.items[0] : null;
  const priceId = firstItem?.price?.id || firstItem?.price_id || null;
  const cancelAtPeriodEnd = data.scheduled_change?.action === "cancel" ? 1 : 0;
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO paddle_subscriptions
      (user_id, paddle_customer_id, paddle_subscription_id, paddle_price_id, status, current_period_start, current_period_end, cancel_at_period_end, last_event_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      paddle_customer_id=excluded.paddle_customer_id,
      paddle_subscription_id=excluded.paddle_subscription_id,
      paddle_price_id=excluded.paddle_price_id,
      status=excluded.status,
      current_period_start=COALESCE(excluded.current_period_start, paddle_subscriptions.current_period_start),
      current_period_end=COALESCE(excluded.current_period_end, paddle_subscriptions.current_period_end),
      cancel_at_period_end=excluded.cancel_at_period_end,
      last_event_at=excluded.last_event_at,
      updated_at=excluded.updated_at
    WHERE excluded.last_event_at >= paddle_subscriptions.last_event_at
  `).bind(
    userId, String(data.customer_id || previous?.paddle_customer_id || ""), String(data.id),
    priceId, eventStatus, periodStart, periodEnd, cancelAtPeriodEnd, occurredAt, now
  ).run();
  if (eventId) await env.DB.prepare("INSERT OR IGNORE INTO paddle_webhook_events (event_id, received_at) VALUES (?, ?)").bind(eventId, now).run();
  return { saved: true, status: eventStatus };
}
async function handlePaddleWebhook(request, env) {
  if (!env.PADDLE_WEBHOOK_SECRET) return json({ error: "Paddle webhook secret is not configured." }, 503);
  const payload = await request.text();
  const signature = request.headers.get("Paddle-Signature") || "";
  if (!await verifyPaddleWebhookSignature(payload, signature, env.PADDLE_WEBHOOK_SECRET)) {
    return json({ error: "Invalid Paddle webhook signature." }, 400);
  }
  let event;
  try { event = JSON.parse(payload); } catch { return json({ error: "Invalid Paddle event payload." }, 400); }
  try {
    const result = await savePaddleSubscriptionEvent(env, event);
    return json({ received: true, ...result });
  } catch (error) {
    console.error("Paddle webhook processing failed:", error?.message || "unknown");
    return json({ error: "Paddle webhook processing failed." }, 500);
  }
}

function stripeForm(params) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") form.set(key, String(value));
  }
  return form;
}
async function stripeApiRequest(env, endpoint, params, method = "POST") {
  if (!env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured for this environment yet.");
  const response = await fetch("https://api.stripe.com/v1" + endpoint, {
    method,
    headers: {
      "Authorization": "Bearer " + env.STRIPE_SECRET_KEY,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    ...(method === "GET" ? {} : { body: stripeForm(params).toString() })
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data?.error?.message || "Stripe could not complete the billing request.");
  return data;
}
async function createBillingCheckout(request, env, url) {
  try {
    const user = await getSessionUser(request, env);
    if (!user) return json({ error: "Please sign in before subscribing.", code: "LOGIN_REQUIRED" }, 401);
    const settings = await readSubscriptionSettings(env);
    if (!settings.enabled) return json({ error: "Subscriptions are not currently enabled. JALSA is free for everyone right now.", code: "SUBSCRIPTIONS_DISABLED" }, 409);
    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID) return json({ error: "Paid subscriptions are not configured in this test environment yet.", code: "BILLING_NOT_CONFIGURED" }, 503);
    const access = await subscriptionAccessForUser(user, env);
    if (access.active) return json({ error: "Your account already has active access.", code: "ALREADY_HAS_ACCESS" }, 409);
    const existing = await env.DB.prepare("SELECT stripe_customer_id, stripe_subscription_id, status, current_period_end FROM billing_subscriptions WHERE user_id=? LIMIT 1").bind(user.id).first();
    if (existing?.stripe_subscription_id && existing.current_period_end && existing.current_period_end > new Date().toISOString() &&
        ["active", "trialing", "past_due", "unpaid", "incomplete"].includes(existing.status)) {
      return json({ error: "A subscription already exists for this account. Open Manage billing to update payment details or cancel it.", code: "EXISTING_BILLING_SUBSCRIPTION" }, 409);
    }
    const body = await readBody(request);
    const language = body.language === "ar" ? "ar" : "en";
    const origin = url.origin;
    const pagePath = language === "ar" ? "/ar/" : "/";
    const params = {
      mode: "subscription",
      "line_items[0][price]": env.STRIPE_PRICE_ID,
      "line_items[0][quantity]": "1",
      client_reference_id: user.id,
      customer: existing?.stripe_customer_id || undefined,
      customer_email: existing?.stripe_customer_id ? undefined : user.email,
      "metadata[jalsa_user_id]": user.id,
      "subscription_data[metadata][jalsa_user_id]": user.id,
      "subscription_data[description]": "JALSA monthly auto-renewing access",
      allow_promotion_codes: "true",
      billing_address_collection: "auto",
      success_url: origin + pagePath + "?subscription=success",
      cancel_url: origin + pagePath + "?subscription=cancelled",
      locale: language === "ar" ? "auto" : "en"
    };
    const session = await stripeApiRequest(env, "/checkout/sessions", params);
    if (!session.url) return json({ error: "Stripe did not return a Checkout URL.", code: "STRIPE_NO_CHECKOUT_URL" }, 502);
    return json({ ok: true, url: session.url });
  } catch (error) {
    const raw = String(error?.message || "Unknown checkout error");
    const safeMessage = raw
      .replace(/sk_(?:test|live)_[A-Za-z0-9]+/g, "[redacted Stripe key]")
      .replace(/whsec_[A-Za-z0-9]+/g, "[redacted webhook secret]")
      .slice(0, 320);
    console.error("JALSA Stripe checkout failed:", safeMessage);
    return json({ error: "Stripe checkout could not start: " + safeMessage, code: "STRIPE_CHECKOUT_FAILED" }, 502);
  }
}
async function createBillingPortal(request, env, url) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Please sign in to manage billing.", code: "LOGIN_REQUIRED" }, 401);
  await ensureSubscriptionSchema(env);
  const billing = await env.DB.prepare("SELECT stripe_customer_id FROM billing_subscriptions WHERE user_id=? LIMIT 1").bind(user.id).first();
  if (!billing?.stripe_customer_id) return json({ error: "No paid subscription is linked to this account yet.", code: "NO_BILLING_CUSTOMER" }, 404);
  const body = await readBody(request);
  const pagePath = body.language === "ar" ? "/ar/" : "/";
  const params = {
    customer: billing.stripe_customer_id,
    return_url: url.origin + pagePath + "?billing=returned"
  };
  if (env.STRIPE_PORTAL_CONFIGURATION_ID) params.configuration = env.STRIPE_PORTAL_CONFIGURATION_ID;
  const session = await stripeApiRequest(env, "/billing_portal/sessions", params);
  if (!session.url) return json({ error: "Stripe did not return a billing portal URL." }, 502);
  return json({ ok: true, url: session.url });
}
async function cancelBillingSubscription(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Please sign in to manage billing.", code: "LOGIN_REQUIRED" }, 401);
  await ensureSubscriptionSchema(env);
  const billing = await env.DB.prepare("SELECT stripe_subscription_id, current_period_end, status FROM billing_subscriptions WHERE user_id=? LIMIT 1").bind(user.id).first();
  if (!billing?.stripe_subscription_id || !["active", "trialing", "past_due"].includes(billing.status)) {
    return json({ error: "There is no active paid subscription to cancel.", code: "NO_ACTIVE_SUBSCRIPTION" }, 409);
  }
  const updated = await stripeApiRequest(env, "/subscriptions/" + encodeURIComponent(billing.stripe_subscription_id), { cancel_at_period_end: "true" });
  await env.DB.prepare("UPDATE billing_subscriptions SET cancel_at_period_end=1, updated_at=? WHERE user_id=?").bind(new Date().toISOString(), user.id).run();
  return json({ ok: true, cancelAtPeriodEnd: !!updated.cancel_at_period_end, currentPeriodEnd: billing.current_period_end });
}
function hexFromBuffer(buffer) {
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, "0")).join("");
}
async function verifyStripeWebhookSignature(payload, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;
  const parts = signatureHeader.split(",").map(part => part.trim());
  const timestampPart = parts.find(part => part.startsWith("t="));
  const timestamp = timestampPart ? Number(timestampPart.slice(2)) : 0;
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const signatures = parts.filter(part => part.startsWith("v1=")).map(part => part.slice(3));
  if (!signatures.length) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(timestamp + "." + payload));
  const expected = hexFromBuffer(signed);
  return signatures.some(signature => constantTimeEqual(signature, expected));
}
function stripePeriodIso(timestamp) {
  const value = Number(timestamp || 0);
  return value > 0 ? new Date(value * 1000).toISOString() : null;
}
async function saveStripeSubscriptionEvent(env, event, subscription, forcedStatus) {
  await ensureSubscriptionSchema(env);
  const eventCreated = Number(event.created || 0);
  const subscriptionId = subscription.id;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  const metadata = subscription.metadata || {};
  let userId = metadata.jalsa_user_id || metadata.user_id || "";
  if (!userId && subscriptionId) {
    const old = await env.DB.prepare("SELECT user_id FROM billing_subscriptions WHERE stripe_subscription_id=? LIMIT 1").bind(subscriptionId).first();
    userId = old?.user_id || "";
  }
  if (!userId && customerId) {
    const old = await env.DB.prepare("SELECT user_id FROM billing_subscriptions WHERE stripe_customer_id=? LIMIT 1").bind(customerId).first();
    userId = old?.user_id || "";
  }
  if (!userId) {
    console.warn("Stripe subscription event did not include a linked JALSA user.");
    return;
  }
  const firstItem = subscription.items?.data?.[0] || {};
  const priceId = firstItem.price?.id || firstItem.plan?.id || null;
  const start = subscription.current_period_start || firstItem.current_period_start;
  const end = subscription.current_period_end || firstItem.current_period_end;
  const now = new Date().toISOString();
  const status = forcedStatus || subscription.status || "incomplete";
  await env.DB.prepare(
    `INSERT INTO billing_subscriptions
      (user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, status, current_period_start, current_period_end, cancel_at_period_end, last_event_created, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       stripe_customer_id=excluded.stripe_customer_id,
       stripe_subscription_id=excluded.stripe_subscription_id,
       stripe_price_id=excluded.stripe_price_id,
       status=excluded.status,
       current_period_start=excluded.current_period_start,
       current_period_end=excluded.current_period_end,
       cancel_at_period_end=excluded.cancel_at_period_end,
       last_event_created=excluded.last_event_created,
       updated_at=excluded.updated_at
     WHERE excluded.last_event_created >= billing_subscriptions.last_event_created`,
  ).bind(
    userId, customerId || null, subscriptionId, priceId, status,
    stripePeriodIso(start), stripePeriodIso(end), subscription.cancel_at_period_end ? 1 : 0,
    eventCreated, now
  ).run();
}
async function handleStripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: "Stripe webhook is not configured." }, 503);
  const payload = await request.text();
  const signature = request.headers.get("Stripe-Signature") || "";
  if (!await verifyStripeWebhookSignature(payload, signature, env.STRIPE_WEBHOOK_SECRET)) {
    return json({ error: "Invalid Stripe webhook signature." }, 400);
  }
  let event;
  try { event = JSON.parse(payload); } catch { return json({ error: "Invalid Stripe event payload." }, 400); }
  const object = event.data?.object || {};
  if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
    const forced = event.type === "customer.subscription.deleted" ? "canceled" : null;
    await saveStripeSubscriptionEvent(env, event, object, forced);
  } else if (event.type === "invoice.payment_failed" || event.type === "invoice.paid") {
    const subscriptionId = typeof object.subscription === "string"
      ? object.subscription
      : object.parent?.subscription_details?.subscription || "";
    if (subscriptionId) {
      const status = event.type === "invoice.paid" ? "active" : "past_due";
      await ensureSubscriptionSchema(env);
      await env.DB.prepare(
        "UPDATE billing_subscriptions SET status=?, last_event_created=?, updated_at=? WHERE stripe_subscription_id=? AND ? >= last_event_created"
      ).bind(status, Number(event.created || 0), new Date().toISOString(), subscriptionId, Number(event.created || 0)).run();
    }
  }
  return json({ received: true });
}

async function ensureGameAvailabilitySchema(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS game_availability (game_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, updated_by TEXT)").run();
  const now = new Date().toISOString();
  for (const game of GAME_AVAILABILITY) await env.DB.prepare("INSERT OR IGNORE INTO game_availability (game_id, enabled, updated_at) VALUES (?, 1, ?)").bind(game.id, now).run();
}
async function readGameAvailability(env, gameId) {
  await ensureGameAvailabilitySchema(env);
  const row = await env.DB.prepare("SELECT enabled FROM game_availability WHERE game_id=? LIMIT 1").bind(gameId).first();
  return { id: gameId, enabled: row ? Number(row.enabled) === 1 : true };
}
async function getGameAvailability(env) {
  await ensureGameAvailabilitySchema(env);
  const rows = await env.DB.prepare("SELECT game_id, enabled FROM game_availability").all();
  const values = new Map((rows.results || []).map(row => [row.game_id, Number(row.enabled) === 1]));
  return json({ games: GAME_AVAILABILITY.map(game => ({ ...game, enabled: values.has(game.id) ? values.get(game.id) : true })) });
}
async function getAdminGameAvailability(request, env) {
  if (!await requireAdmin(request, env)) return json({ error: "Administrator access required." }, 403);
  return await getGameAvailability(env);
}
async function updateGameAvailability(request, env, gameId) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "Administrator access required." }, 403);
  if (!GAME_AVAILABILITY.some(game => game.id === gameId)) return json({ error: "Unknown game." }, 404);
  const body = await readBody(request);
  if (typeof body.enabled !== "boolean") return json({ error: "Choose whether the game is enabled." }, 400);
  await ensureGameAvailabilitySchema(env);
  await env.DB.prepare("UPDATE game_availability SET enabled=?, updated_at=?, updated_by=? WHERE game_id=?")
    .bind(body.enabled ? 1 : 0, new Date().toISOString(), admin.id, gameId).run();
  return json({ ok: true, id: gameId, enabled: body.enabled });
}

async function ensureInsightSchema(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS insight_rooms (room_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, host_user_id TEXT NOT NULL, state_json TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, ended_at TEXT)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_insight_rooms_host ON insight_rooms(host_user_id, created_at)").run();
}
function insightShuffle(items) {
  const a=[...items]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a;
}
async function insightRoom(body, env) {
  const roomId=String(body.roomId||""), key=String(body.key||"");
  if(!/^[A-Za-z0-9_-]{20,40}$/.test(roomId)||key.length<40||key.length>60)return null;
  const row=await env.DB.prepare("SELECT * FROM insight_rooms WHERE room_id=? LIMIT 1").bind(roomId).first();
  if(!row||row.ended_at||row.expires_at<=new Date().toISOString()||!constantTimeEqual(row.token_hash,await sha256Hex(key)))return null;
  let state={};try{state=JSON.parse(row.state_json||"{}")}catch{return null;}
  return {...row,state};
}
async function saveInsight(env, room, state) {
  const result=await env.DB.prepare("UPDATE insight_rooms SET state_json=? WHERE room_id=? AND state_json=? AND ended_at IS NULL").bind(JSON.stringify(state),room.room_id,room.state_json).run();
  return Number(result.meta?.changes||0)>0;
}
async function createInsightRoom(request,env) {
  const user=await getSessionUser(request,env); if(!user)return json({error:"Please sign in to host INSIGHT."},401);
  await ensureInsightSchema(env);
  const roomId=toBase64Url(randomBytes(18)),key=toBase64Url(randomBytes(32)),now=new Date(),expires=new Date(now.getTime()+3*60*60*1000).toISOString();
  const state={stage:"lobby",players:[],round:0,heartbreakerId:null,question:"",targetId:null,answerId:null,coinChoice:null,coinResult:null,revealed:false,deliverAt:null};
  await env.DB.prepare("INSERT INTO insight_rooms (room_id,token_hash,host_user_id,state_json,created_at,expires_at) VALUES (?,?,?,?,?,?)").bind(roomId,await sha256Hex(key),user.id,JSON.stringify(state),now.toISOString(),expires).run();
  return json({roomId,key,expiresAt:expires});
}
async function joinInsightRoom(request,env) {
  await ensureInsightSchema(env);
  const body=await readBody(request),room=await insightRoom(body,env); if(!room)return json({error:"This game QR is invalid or expired."},404);
  const name=cleanText(body.name,32); if(name.length<2)return json({error:"Enter a name with at least 2 characters."},400);
  if(room.state.stage!=="lobby")return json({error:"This game has already started."},409);
  if(room.state.players.some(p=>p.name.toLowerCase()===name.toLowerCase()))return json({error:"That name is already taken."},409);
  if(room.state.players.length>=24)return json({error:"This game is full (24 players maximum)."},409);
  const playerId=toBase64Url(randomBytes(18));room.state.players.push({id:playerId,name});
  if(!await saveInsight(env,room,room.state))return json({error:"A player just joined. Please try again."},409);
  return json({ok:true,playerId,name});
}
async function getInsightState(request,env,url) {
  let room=await insightRoom({roomId:url.searchParams.get("roomId"),key:url.searchParams.get("key")},env);
  if(!room)return json({error:"This game session has expired."},404);
  // Advance after the result has been visible for 6.5 seconds. Any participant polling
  // can trigger this transition; the compare-and-swap save ensures it happens only once.
  if(room.state.stage==="round-result"&&room.state.resultAt&&Date.now()-Date.parse(room.state.resultAt)>=6500){
    const previous=room.state,pool=previous.players.filter(p=>p.id!==previous.heartbreakerId);
    if(pool.length){
      const chosen=insightShuffle(pool)[0],nextState={...previous,stage:"active",round:previous.round+1,heartbreakerId:chosen.id,question:"",targetId:null,answerId:null,coinChoice:null,coinResult:null,revealed:false,deliverAt:null,resultAt:null,roleRevealAt:new Date(Date.now()+2500).toISOString()};
      if(await saveInsight(env,room,nextState)){room={...room,state:nextState,state_json:JSON.stringify(nextState)}}
      else {const latest=await insightRoom({roomId:url.searchParams.get("roomId"),key:url.searchParams.get("key")},env);if(latest)room=latest}
    }
  }
  const playerId=url.searchParams.get("playerId")||"",player=room.state.players.find(p=>p.id===playerId);
  const user=await getSessionUser(request,env),isHost=!!user&&user.id===room.host_user_id;
  if(!player&&!isHost)return json({error:"Player not found. Scan the QR again."},404);
  const s=room.state,now=Date.now(),delivered=s.deliverAt&&now>=Date.parse(s.deliverAt),roleReady=!s.roleRevealAt||now>=Date.parse(s.roleRevealAt);
  const reveal=s.revealed?{question:s.question,heartbreakerName:s.players.find(p=>p.id===s.heartbreakerId)?.name||"",targetName:s.players.find(p=>p.id===s.targetId)?.name||"",answerName:s.players.find(p=>p.id===s.answerId)?.name||"",coinChoice:s.coinChoice,coinResult:s.coinResult}:null;
  return json({state:{stage:s.stage,players:s.players.map(p=>({id:p.id,name:p.name})),round:s.round,isHost,coinOutcome:s.stage==="round-result"?{coinChoice:s.coinChoice,coinResult:s.coinResult,revealed:!!s.revealed}:null,player:player?{id:player.id,name:player.name}:null,role:player&&s.stage!=="lobby"&&roleReady?(player.id===s.heartbreakerId?"heartbreaker":player.id===s.targetId&&delivered?"target":"player"):null,questionForTarget:player&&player.id===s.targetId&&delivered&&!s.revealed?s.question:null,waitingForDelivery:player&&player.id===s.targetId&&!delivered&&!!s.deliverAt,answered:!!s.answerId,revealed:!!s.revealed,reveal,canChoose:s.stage==="active"&&player&&player.id===s.targetId&&delivered&&!s.answerId,heartbreakerCanAsk:s.stage==="active"&&roleReady&&player&&player.id===s.heartbreakerId&&!s.question,heartbreakerName:s.players.find(p=>p.id===s.heartbreakerId)?.name||"",targetName:s.players.find(p=>p.id===s.targetId)?.name||""}});
}
async function insightAction(request,env) {
  const body=await readBody(request),room=await insightRoom(body,env);if(!room)return json({error:"This game session has expired."},404);
  const s=room.state,action=String(body.action||""),player=s.players.find(p=>p.id===String(body.playerId||""));
  if(action==="start"){
    const user=await getSessionUser(request,env);if(!user||user.id!==room.host_user_id)return json({error:"Only the host can start."},403);
    if(s.stage!=="lobby"||s.players.length<3)return json({error:"At least 3 players are required."},400);
    const chosen=insightShuffle(s.players)[0];Object.assign(s,{stage:"active",round:1,heartbreakerId:chosen.id,question:"",targetId:null,answerId:null,coinChoice:null,coinResult:null,revealed:false,deliverAt:null,roleRevealAt:new Date(Date.now()+5000).toISOString()});
  } else if(action==="ask"){
    if(!player||player.id!==s.heartbreakerId||s.stage!=="active"||s.question)return json({error:"You cannot send a question now."},403);
    const target=s.players.find(p=>p.id===String(body.targetId||"")),question=cleanText(body.question,240);
    if(!target||target.id===player.id)return json({error:"Choose another player."},400);
    if(question.length<4)return json({error:"Write a longer question."},400);
    s.question=question;s.targetId=target.id;s.deliverAt=new Date(Date.now()+5000).toISOString();
  } else if(action==="flip"){
    if(!player||player.id!==s.targetId||s.stage!=="active"||!s.deliverAt||Date.now()<Date.parse(s.deliverAt)||s.answerId)return json({error:"You cannot answer now."},403);
    const answer=s.players.find(p=>p.id===String(body.answerId||"")),rawSide=String(body.coinChoice||""),side=rawSide==="warrior"||rawSide==="heads"?"warrior":rawSide==="tree"||rawSide==="tails"?"tree":"";
    if(!answer)return json({error:"Choose a player as your answer."},400);
    if(answer.id===player.id)return json({error:"You cannot choose yourself. Please choose another player."},400);
    if(!side)return json({error:"Choose the Warrior or the Tree of Life."},400);
    // One unbiased random bit: exactly 50% Warrior and 50% Tree of Life.
    const randomBit=crypto.getRandomValues(new Uint8Array(1))[0]&1;
    s.answerId=answer.id;s.coinChoice=side;s.coinResult=randomBit===0?"warrior":"tree";s.revealed=s.coinResult!==s.coinChoice;s.stage="round-result";s.resultAt=new Date().toISOString();
  } else if(action==="next"){
    const user=await getSessionUser(request,env);if(!user||user.id!==room.host_user_id)return json({error:"Only the host can continue."},403);
    if(s.stage!=="round-result")return json({error:"Finish the current round first."},400);
    const pool=s.players.filter(p=>p.id!==s.heartbreakerId),chosen=insightShuffle(pool)[0];
    Object.assign(s,{stage:"active",round:s.round+1,heartbreakerId:chosen.id,question:"",targetId:null,answerId:null,coinChoice:null,coinResult:null,revealed:false,deliverAt:null,resultAt:null,roleRevealAt:new Date(Date.now()+2500).toISOString()});
  } else if(action==="end"){
    const user=await getSessionUser(request,env);if(!user||user.id!==room.host_user_id)return json({error:"Only the host can end."},403);
    s.stage="ended";
  } else return json({error:"Unknown INSIGHT action."},400);
  if(!await saveInsight(env,room,s))return json({error:"The game just updated. Please try again."},409);
  return json({ok:true});
}

async function ensureImposterSchema(env){
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS imposter_words (id TEXT PRIMARY KEY, category TEXT NOT NULL, word_en TEXT NOT NULL, word_ar TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
 await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_imposter_words_category ON imposter_words(category,word_en)").run();
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS imposter_rooms (room_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, host_user_id TEXT NOT NULL, state_json TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, ended_at TEXT)").run();
 await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_imposter_rooms_host ON imposter_rooms(host_user_id,created_at)").run();
 const count=await env.DB.prepare("SELECT COUNT(*) AS count FROM imposter_words").first();
 if(Number(count?.count||0)===0){
  const words=[["Fruit","Watermelon","بطيخ"],["Fruit","Pineapple","أناناس"],["Fruit","Strawberry","فراولة"],["Fruit","Mango","مانجو"],["Fruit","Orange","برتقال"],["Restaurant","McDonald's","ماكدونالدز"],["Restaurant","Pizza Hut","بيتزا هت"],["Restaurant","KFC","كنتاكي"],["Restaurant","Shake Shack","شيك شاك"],["Restaurant","Starbucks","ستاربكس"],["Cars","Toyota Camry","تويوتا كامري"],["Cars","Tesla Model 3","تسلا موديل 3"],["Cars","Mercedes-Benz G-Class","مرسيدس جي كلاس"],["Cars","Porsche 911","بورش 911"],["Cars","Jeep Wrangler","جيب رانجلر"],["Electronics","iPhone","آيفون"],["Electronics","PlayStation 5","بلايستيشن 5"],["Electronics","AirPods","إيربودز"],["Electronics","Nintendo Switch","نينتندو سويتش"],["Electronics","MacBook","ماك بوك"],["Places","Airport","مطار"],["Places","Beach","شاطئ"],["Places","Cinema","سينما"],["Places","Shopping mall","مول"],["Places","Amusement park","مدينة ملاهي"],["Animals","Dolphin","دلفين"],["Animals","Penguin","بطريق"],["Animals","Giraffe","زرافة"],["Animals","Tiger","نمر"],["Animals","Camel","جمل"]];
  const now=new Date().toISOString();
  for(let i=0;i<words.length;i++){const w=words[i];await env.DB.prepare("INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES (?,?,?,?,?,?)").bind("seed-"+String(i+1).padStart(3,"0"),w[0],w[1],w[2],now,now).run();}
 }
}
function imposterShuffle(items){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
async function createImposterRoom(request,env){
 const user=await getSessionUser(request,env);
 if(!user)return json({error:"Please sign in to host a game."},401);
 await ensureImposterSchema(env);
 const words=await env.DB.prepare("SELECT COUNT(*) AS count FROM imposter_words").first();
 if(!Number(words?.count||0))return json({error:"The Imposter word list is empty. Ask an admin to add words first."},400);
 const roomId=toBase64Url(randomBytes(18)),key=toBase64Url(randomBytes(32)),now=new Date(),expires=new Date(now.getTime()+3*60*60*1000).toISOString();
 const state={stage:"lobby",players:[],turnIndex:0,turnsCompleted:0,currentSpeakerId:null,speakerQueue:[],ready:[],votes:{},roles:{},secret:null,scores:{},roundPoints:{},guesserId:null,wordOptions:[],result:null};
 await env.DB.prepare("INSERT INTO imposter_rooms (room_id,token_hash,host_user_id,state_json,created_at,expires_at) VALUES (?,?,?,?,?,?)").bind(roomId,await sha256Hex(key),user.id,JSON.stringify(state),now.toISOString(),expires).run();
 return json({roomId,key,expiresAt:expires});
}
async function joinImposterRoom(request,env){
 await ensureImposterSchema(env);
 const body=await readBody(request),room=await imposterRoomByKey(body,env);
 if(!room)return json({error:"This game QR is invalid or expired."},404);
 const name=cleanText(body.name,32);
 if(name.length<2)return json({error:"Enter a name with at least 2 characters."},400);
 if(room.state.stage!=="lobby")return json({error:"This game has already started."},409);
 if(room.state.players.some(p=>p.name.toLowerCase()===name.toLowerCase()))return json({error:"That name is already taken. Choose another."},409);
 if(room.state.players.length>=24)return json({error:"This game is full (24 players maximum)."},409);
 const playerId=toBase64Url(randomBytes(18));
 room.state.players.push({id:playerId,name});
 if(!await saveImposterState(env,room,room.state))return json({error:"Another player just joined. Please try again."},409);
 return json({ok:true,playerId,name});
}
async function listImposterWords(request,env){
 if(!await requireAdmin(request,env))return json({error:"Administrator access required."},403);
 await ensureImposterSchema(env);
 const rows=await env.DB.prepare("SELECT id,category,word_en,word_ar,created_at FROM imposter_words ORDER BY category,word_en").all();
 return json({words:rows.results||[]});
}
function cleanImposterWord(body){
 const category=cleanText(body.category,60),wordEn=cleanText(body.word_en,100),wordAr=cleanText(body.word_ar,100);
 if(category.length<2||wordEn.length<2)return {error:"Enter a category and an English word."};
 return {category,word_en:wordEn,word_ar:wordAr};
}
async function saveImposterWord(request,env){
 if(!await requireAdmin(request,env))return json({error:"Administrator access required."},403);
 await ensureImposterSchema(env);
 const body=await readBody(request),w=cleanImposterWord(body);if(w.error)return json({error:w.error},400);
 const id=crypto.randomUUID(),now=new Date().toISOString();
 await env.DB.prepare("INSERT INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES (?,?,?,?,?,?)").bind(id,w.category,w.word_en,w.word_ar||null,now,now).run();
 return json({ok:true,id});
}
async function updateImposterWord(request,env,id){
 if(!await requireAdmin(request,env))return json({error:"Administrator access required."},403);
 const body=await readBody(request),w=cleanImposterWord(body);if(w.error)return json({error:w.error},400);
 await env.DB.prepare("UPDATE imposter_words SET category=?,word_en=?,word_ar=?,updated_at=? WHERE id=?").bind(w.category,w.word_en,w.word_ar||null,new Date().toISOString(),id).run();
 return json({ok:true});
}
async function deleteImposterWord(request,env,id){
 if(!await requireAdmin(request,env))return json({error:"Administrator access required."},403);
 await env.DB.prepare("DELETE FROM imposter_words WHERE id=?").bind(id).run();return json({ok:true});
}

async function listKharjWords(request,env){
 if(!await requireAdmin(request,env))return json({error:"Administrator access required."},403);
 await ensureKharjSchema(env);
 const rows=await env.DB.prepare("SELECT id,category_id,word_en,word_ar,created_at FROM kharj_words ORDER BY category_id,word_en").all();
 return json({words:rows.results||[],categories:KHARJ_CATEGORIES});
}
function cleanKharjWord(body){
 const categoryId=cleanText(body.category_id,60),wordEn=cleanText(body.word_en,100),wordAr=cleanText(body.word_ar,100);
 if(!kharjCategory(categoryId))return {error:"Choose a valid Kharj category."};
 if(wordEn.length<2)return {error:"Enter an English word with at least 2 characters."};
 return {category_id:categoryId,word_en:wordEn,word_ar:wordAr};
}
async function saveKharjWord(request,env){
 if(!await requireAdmin(request,env))return json({error:"Administrator access required."},403);
 await ensureKharjSchema(env);
 const body=await readBody(request),word=cleanKharjWord(body);if(word.error)return json({error:word.error},400);
 const id=crypto.randomUUID(),now=new Date().toISOString();
 await env.DB.prepare("INSERT INTO kharj_words (id,category_id,word_en,word_ar,created_at,updated_at) VALUES (?,?,?,?,?,?)").bind(id,word.category_id,word.word_en,word.word_ar||null,now,now).run();
 return json({ok:true,id});
}
async function updateKharjWord(request,env,id){
 if(!await requireAdmin(request,env))return json({error:"Administrator access required."},403);
 await ensureKharjSchema(env);
 const body=await readBody(request),word=cleanKharjWord(body);if(word.error)return json({error:word.error},400);
 await env.DB.prepare("UPDATE kharj_words SET category_id=?,word_en=?,word_ar=?,updated_at=? WHERE id=?").bind(word.category_id,word.word_en,word.word_ar||null,new Date().toISOString(),id).run();
 return json({ok:true});
}
async function deleteKharjWord(request,env,id){
 if(!await requireAdmin(request,env))return json({error:"Administrator access required."},403);
 await ensureKharjSchema(env);
 await env.DB.prepare("DELETE FROM kharj_words WHERE id=?").bind(id).run();return json({ok:true});
}

async function imposterRoomByKey(body,env){
 const roomId=String(body.roomId||""),key=String(body.key||"");
 if(!/^[A-Za-z0-9_-]{20,40}$/.test(roomId)||key.length<40||key.length>60)return null;
 const room=await env.DB.prepare("SELECT * FROM imposter_rooms WHERE room_id=? LIMIT 1").bind(roomId).first();
 if(!room||room.ended_at||room.expires_at<=new Date().toISOString()||!constantTimeEqual(room.token_hash,await sha256Hex(key)))return null;
 let state={};try{state=JSON.parse(room.state_json||"{}")}catch{}return {...room,state};
}
async function saveImposterState(env,room,state){
 const result=await env.DB.prepare("UPDATE imposter_rooms SET state_json=? WHERE room_id=? AND state_json=? AND ended_at IS NULL").bind(JSON.stringify(state),room.room_id,room.state_json).run();
 return Number(result.meta?.changes||0)>0;
}
async function getImposterHostState(request,env,url){
 const user=await getSessionUser(request,env);
 if(!user)return json({error:"Please sign in again."},401);
 const roomId=String(url.searchParams.get("roomId")||"");
 const room=await env.DB.prepare("SELECT * FROM imposter_rooms WHERE room_id=? AND host_user_id=? LIMIT 1").bind(roomId,user.id).first();
 if(!room||room.ended_at||room.expires_at<=new Date().toISOString())return json({error:"Game session not found or expired."},404);
 let state={};try{state=JSON.parse(room.state_json||"{}")}catch{return json({error:"Game state is unreadable."},500)}
 return json({state:imposterPublicState(state)});
}

function imposterChooseNextSpeaker(state,previousId=null){
 const players=state.players||[];
 let queue=Array.isArray(state.speakerQueue)?state.speakerQueue.filter(id=>players.some(p=>p.id===id)):[];
 if(!queue.length){
  queue=imposterShuffle(players.map(p=>p.id));
  if(queue.length>1&&queue[0]===previousId){const swap=queue[0];queue[0]=queue[1];queue[1]=swap}
 }
 state.currentSpeakerId=queue.shift()||null;
 state.speakerQueue=queue;
}
function imposterPublicState(state){
 const speaker=(state.players||[]).find(p=>p.id===state.currentSpeakerId)||null;
 const guesser=(state.players||[]).find(p=>p.id===state.guesserId)||null;
 return {stage:state.stage,players:(state.players||[]).map(p=>({id:p.id,name:p.name})),
  turnIndex:state.turnIndex||0,turnsCompleted:state.turnsCompleted||0,
  currentSpeakerName:speaker?.name||"",readyCount:(state.ready||[]).length,
  voteCount:Object.keys(state.votes||{}).length,guesserName:guesser?.name||"",
  result:state.stage==="results"?state.result:null};
}
async function getImposterPlayerState(request,env,url){
 const room=await imposterRoomByKey({roomId:url.searchParams.get("roomId"),key:url.searchParams.get("key")},env);
 if(!room)return json({error:"This game session has expired."},404);
 const playerId=url.searchParams.get("playerId")||"",player=room.state.players.find(p=>p.id===playerId);
 if(!player)return json({error:"Player not found. Scan the QR again."},404);
 const state=room.state,speaker=(state.players||[]).find(p=>p.id===state.currentSpeakerId)||null;
 const guesser=(state.players||[]).find(p=>p.id===state.guesserId)||null;
 const isGuesser=state.stage==="guessing"&&state.guesserId===playerId;
 return json({state:{
  stage:state.stage,player:{id:player.id,name:player.name},
  players:(state.players||[]).map(p=>({id:p.id,name:p.name})),
  turnIndex:state.turnIndex||0,turnsCompleted:state.turnsCompleted||0,
  currentSpeaker:speaker?{name:speaker.name,isYou:speaker.id===playerId}:null,
  role:state.stage==="lobby"?null:(state.roles[playerId]||"player"),
  word:state.stage==="lobby"||state.roles[playerId]==="imposter"?null:state.secret?.word,
  wordAr:state.stage==="lobby"||state.roles[playerId]==="imposter"?null:(state.secret?.wordAr||state.secret?.word),
  category:state.stage==="lobby"||state.roles[playerId]==="imposter"?null:state.secret?.category,
  ready:(state.ready||[]).includes(playerId),readyCount:(state.ready||[]).length,
  voted:Object.prototype.hasOwnProperty.call(state.votes||{},playerId),
  voteOptions:state.stage==="voting"?(state.players||[]).filter(p=>p.id!==playerId).map(p=>({id:p.id,name:p.name})):[],
  isGuesser,guesserName:guesser?.name||"",
  wordOptions:isGuesser?(state.wordOptions||[]).map(o=>({word:o.word,wordAr:o.wordAr||o.word})):[],
  result:state.stage==="results"?state.result:null
 }});
}
async function imposterPrepareWordOptions(env,state){
 const secret=state.secret||{},secretKey=String(secret.word||"").trim().toLocaleLowerCase();
 const chosen=[],seen=new Set([secretKey]);
 const addRows=rows=>{
  for(const row of rows||[]){
   const word=String(row.word_en||"").trim(),key=word.toLocaleLowerCase();
   if(word.length<2||seen.has(key))continue;
   seen.add(key);chosen.push({word,wordAr:String(row.word_ar||word)});
   if(chosen.length>=4)break;
  }
 };
 const sameCategory=await env.DB.prepare("SELECT word_en,word_ar FROM imposter_words WHERE category=? AND lower(word_en)<>lower(?) ORDER BY random() LIMIT 12").bind(secret.category,secret.word).all();
 addRows(sameCategory.results);
 if(chosen.length<4){
  const more=await env.DB.prepare("SELECT word_en,word_ar FROM imposter_words WHERE lower(word_en)<>lower(?) ORDER BY random() LIMIT 30").bind(secret.word).all();
  addRows(more.results);
 }
 state.wordOptions=imposterShuffle([{word:secret.word,wordAr:secret.wordAr||secret.word},...chosen]);
}
async function imposterHostAction(request,env){
 const user=await getSessionUser(request,env);
 if(!user)return json({error:"Please sign in again."},401);
 const body=await readBody(request);
 const room=await env.DB.prepare("SELECT * FROM imposter_rooms WHERE room_id=? AND host_user_id=? LIMIT 1").bind(String(body.roomId||""),user.id).first();
 if(!room||room.ended_at)return json({error:"Game session not found."},404);
 let state={};try{state=JSON.parse(room.state_json||"{}")}catch{}
 if(body.action==="start"||body.action==="restart"){
  const restarting=body.action==="restart";
  if(restarting&&state.stage!=="results")return json({error:"A new game can only start after the results."},409);
  if(!restarting&&(state.stage!=="lobby"||state.players.length<3))return json({error:"At least 3 players are needed."},400);
  const words=await env.DB.prepare("SELECT category,word_en,word_ar FROM imposter_words").all();
  if(!words.results?.length)return json({error:"No words are available."},400);
  const secret=imposterShuffle(words.results)[0],imposter=imposterShuffle(state.players)[0];
  state.stage="playing";state.secret={category:secret.category,word:secret.word_en,wordAr:secret.word_ar||secret.word_en};
  state.roles={};state.players.forEach(p=>state.roles[p.id]=p.id===imposter.id?"imposter":"player");
  const previousScores=state.scores||{};state.scores={};state.roundPoints={};state.players.forEach(p=>{state.scores[p.id]=restarting?Number(previousScores[p.id]||0):0;state.roundPoints[p.id]=0});
  state.speakerQueue=imposterShuffle(state.players.map(p=>p.id));state.currentSpeakerId=state.speakerQueue.shift()||null;
  state.turnIndex=1;state.turnsCompleted=0;state.ready=[];state.votes={};state.guesserId=null;state.wordOptions=[];state.result=null;
 }else if(body.action==="end"){state.stage="ended"}
 else return json({error:"Unknown host action."},400);
 await env.DB.prepare("UPDATE imposter_rooms SET state_json=?,ended_at=? WHERE room_id=?").bind(JSON.stringify(state),body.action==="end"?new Date().toISOString():null,room.room_id).run();
 return json({ok:true});
}
async function imposterPlayerAction(request,env){
 const body=await readBody(request),room=await imposterRoomByKey(body,env);
 if(!room)return json({error:"This game session has expired."},404);
 const playerId=String(body.playerId||"");
 if(!room.state.players.some(p=>p.id===playerId))return json({error:"Player not found."},404);
 const state=room.state;
 if(body.action==="next"){
  if(state.stage!=="playing"||!state.currentSpeakerId)return json({error:"There is no active word turn."},409);
  if(playerId!==state.currentSpeakerId)return json({error:"Only the selected player can press Next."},403);
  const previous=state.currentSpeakerId;
  state.turnsCompleted=(state.turnsCompleted||0)+1;state.turnIndex=(state.turnIndex||0)+1;
  imposterChooseNextSpeaker(state,previous);
  if((state.ready||[]).length===(state.players||[]).length){state.stage="voting";state.currentSpeakerId=null}
 }else if(body.action==="ready"){
  if(state.stage!=="playing"||(state.turnsCompleted||0)<4)return json({error:"Ready to vote is available after four word turns."},409);
  state.ready=Array.isArray(state.ready)?state.ready:[];
  if(!state.ready.includes(playerId))state.ready.push(playerId);
  if(state.ready.length===state.players.length){state.stage="voting";state.currentSpeakerId=null}
 }else if(body.action==="vote"){
  if(state.stage!=="voting")return json({error:"Voting is not open."},409);
  if(Object.prototype.hasOwnProperty.call(state.votes||{},playerId))return json({error:"You have already voted."},409);
  const targetId=String(body.targetId||"");
  if(targetId===playerId||!state.players.some(p=>p.id===targetId))return json({error:"Choose another player."},400);
  state.votes=state.votes||{};state.votes[playerId]=targetId;
  if(Object.keys(state.votes).length===state.players.length){
   const counts={};Object.values(state.votes).forEach(id=>counts[id]=(counts[id]||0)+1);
   const ranked=Object.entries(counts).sort((a,b)=>b[1]-a[1]),top=ranked[0]?.[1]||0;
   const winners=ranked.filter(x=>x[1]===top).map(x=>x[0]);
   const imposterId=Object.keys(state.roles).find(id=>state.roles[id]==="imposter");
   state.scores=state.scores||{};state.roundPoints=state.roundPoints||{};
   for(const player of state.players){state.scores[player.id]=Number(state.scores[player.id]||0);state.roundPoints[player.id]=Number(state.roundPoints[player.id]||0)}
   for(const [voterId,target] of Object.entries(state.votes)){
    if(target===imposterId){state.scores[voterId]+=100;state.roundPoints[voterId]+=100}
   }
   state.guesserId=imposterShuffle(winners)[0]||imposterId||null;
   if(!state.guesserId)return json({error:"The game could not select a player for the word challenge."},500);
   await imposterPrepareWordOptions(env,state);
   state.stage="guessing";
  }
 }else if(body.action==="guess-word"){
  if(state.stage!=="guessing")return json({error:"The word challenge is not open."},409);
  if(playerId!==state.guesserId)return json({error:"Only the most-voted player can choose the word."},403);
  if(state.result)return json({error:"The word has already been chosen."},409);
  const index=Number(body.optionIndex),option=Number.isInteger(index)?(state.wordOptions||[])[index]:null;
  if(!option)return json({error:"Choose one of the available words."},400);
  const normalize=value=>String(value||"").trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,"");
  const correct=normalize(option.word)===normalize(state.secret?.word);
  state.scores=state.scores||{};state.roundPoints=state.roundPoints||{};
  state.scores[playerId]=Number(state.scores[playerId]||0);state.roundPoints[playerId]=Number(state.roundPoints[playerId]||0);
  if(correct){state.scores[playerId]+=100;state.roundPoints[playerId]+=100}
  const guesser=state.players.find(p=>p.id===state.guesserId),imposterId=Object.keys(state.roles).find(id=>state.roles[id]==="imposter");
  const counts={};Object.values(state.votes||{}).forEach(id=>counts[id]=(counts[id]||0)+1);
  const displayScores=state.players.map(p=>({id:p.id,name:p.name,score:Number(state.scores[p.id]||0),earned:Number(state.roundPoints[p.id]||0)})).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
  state.result={
   imposterId,imposterName:state.players.find(p=>p.id===imposterId)?.name||"",
   secretWord:state.secret?.word||"",secretWordAr:state.secret?.wordAr||state.secret?.word||"",
   guesserId:state.guesserId,guesserName:guesser?.name||"",
   guessWord:option.word,guessWordAr:option.wordAr||option.word,guessCorrect:correct,
   votes:counts,scores:displayScores
  };
  state.stage="results";
 }else return json({error:"Unknown player action."},400);
 if(!await saveImposterState(env,room,state))return json({error:"The game just updated. Please tap again."},409);
 return json({ok:true});
}
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
  // Possession of the unguessable QR key authorizes the phone to take over.
  // Re-scanning the same live QR replaces a stale controller from a closed tab.
  await env.DB.prepare("UPDATE remote_rooms SET controller_id=? WHERE room_id=? AND ended_at IS NULL").bind(controllerId,room.room_id).run();
  return json({ok:true,reconnected:true});
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
  const expires = new Date(Date.now() + Math.max(0, maxAge) * 1000).toUTCString();
  return COOKIE_NAME + "=" + token + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + maxAge + "; Expires=" + expires;
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

// JALSA session lookup uses the D1 primary for immediate post-login consistency.
async function getSessionUser(request, env) {
  const token = cookieValue(request, COOKIE_NAME);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);

  // Always validate a freshly-created login session against the latest D1 state.
  // "first-primary" is also safe when read replication is disabled.
  const sessionDb = typeof env.DB.withSession === "function"
    ? env.DB.withSession("first-primary")
    : env.DB;

  return await sessionDb.prepare(
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
async function publicUserWithSubscription(user, env) {
  const safeUser = publicUser(user, env);
  if (!safeUser) return null;
  try {
    const access = await subscriptionAccessForUser(user, env);
    return {
      ...safeUser,
      premiumActive: !!(access.active && ["paddle", "stripe", "admin-grant"].includes(access.source)),
      premiumSource: access.source || null,
      premiumExpiresAt: access.expiresAt || null
    };
  } catch (error) {
    console.warn("JALSA premium status could not be included in account response:", error?.message || "unknown");
    return { ...safeUser, premiumActive: false, premiumSource: null, premiumExpiresAt: null };
  }
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
  return json({ ok: true, user: await publicUserWithSubscription(user, env) }, 200, { "Set-Cookie": sessionCookie(token) });
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
  return json({ ok: true, user: await publicUserWithSubscription(user, env) }, 200, { "Set-Cookie": sessionCookie(token) });
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
  await ensureSubscriptionSchema(env);
  const result = await env.DB.prepare(
    `SELECT u.id, u.display_name AS name, u.email, u.email_verified, u.created_at, u.verified_at, u.last_login_at,
            u.birth_date, u.updated_at, u.banned_at, u.banned_reason,
            CASE WHEN u.password_hash IS NOT NULL AND u.password_hash != '' THEN 1 ELSE 0 END AS has_password,
            g.plan_code AS subscription_plan, g.status AS subscription_status,
            g.starts_at AS subscription_starts_at, g.expires_at AS subscription_expires_at,
            COALESCE(p.status, b.status) AS billing_status,
            COALESCE(p.current_period_start, b.current_period_start) AS billing_period_start,
            COALESCE(p.current_period_end, b.current_period_end) AS billing_period_end,
            COALESCE(p.cancel_at_period_end, b.cancel_at_period_end, 0) AS billing_cancel_at_period_end,
            CASE WHEN p.paddle_subscription_id IS NOT NULL THEN 'paddle' WHEN b.stripe_subscription_id IS NOT NULL THEN 'stripe' ELSE NULL END AS billing_provider
     FROM users u LEFT JOIN user_subscriptions g ON g.user_id=u.id
     LEFT JOIN billing_subscriptions b ON b.user_id=u.id
     LEFT JOIN paddle_subscriptions p ON p.user_id=u.id
     ORDER BY u.created_at DESC LIMIT 1000`,
  ).all();
  return json({ users: result.results || [] });
}

async function getAdminUser(request, env, id) {
  if (!await requireAdmin(request, env)) return json({ error: "Administrator access required." }, 403);
  await ensureSubscriptionSchema(env);
  const user = await env.DB.prepare(
    `SELECT u.id, u.display_name AS name, u.email, u.email_verified, u.created_at, u.verified_at, u.last_login_at,
            u.birth_date, u.avatar_data_url, u.updated_at, u.banned_at, u.banned_reason,
            CASE WHEN u.password_hash IS NOT NULL AND u.password_hash != '' THEN 1 ELSE 0 END AS has_password,
            g.plan_code AS subscription_plan, g.status AS subscription_status,
            g.starts_at AS subscription_starts_at, g.expires_at AS subscription_expires_at,
            COALESCE(p.status, b.status) AS billing_status,
            COALESCE(p.current_period_start, b.current_period_start) AS billing_period_start,
            COALESCE(p.current_period_end, b.current_period_end) AS billing_period_end,
            COALESCE(p.cancel_at_period_end, b.cancel_at_period_end, 0) AS billing_cancel_at_period_end,
            CASE WHEN p.paddle_subscription_id IS NOT NULL THEN 'paddle' WHEN b.stripe_subscription_id IS NOT NULL THEN 'stripe' ELSE NULL END AS billing_provider
     FROM users u LEFT JOIN user_subscriptions g ON g.user_id=u.id
     LEFT JOIN billing_subscriptions b ON b.user_id=u.id
     LEFT JOIN paddle_subscriptions p ON p.user_id=u.id
     WHERE u.id = ? LIMIT 1`,
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
  // A media file may be reused by more than one question or category.
  // Only remove the R2 object after every database reference has been removed.
  const references = await env.DB.prepare(
    "SELECT (SELECT COUNT(*) FROM game_questions WHERE media_url = ?) + (SELECT COUNT(*) FROM game_questions WHERE answer_media_url = ?) + (SELECT COUNT(*) FROM game_categories WHERE image_url = ?) AS total"
  ).bind(String(value), String(value), String(value)).first();
  if (!references || Number(references.total || 0) > 0) return;
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
async function ensureFaqQuestionsSchema(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS faq_questions (id TEXT PRIMARY KEY NOT NULL, user_id TEXT REFERENCES users(id) ON DELETE SET NULL, name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', question TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'en', status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewed','resolved')), ip_hash TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_faq_questions_created ON faq_questions(created_at DESC)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_faq_questions_status ON faq_questions(status,created_at DESC)").run();
}
async function submitFaqQuestion(request, env) {
  await ensureFaqQuestionsSchema(env);
  const body = await readBody(request);
  // Quiet honeypot: bots receive the normal success response, but nothing is stored.
  if (cleanText(body.website, 160)) return json({ ok: true });
  const question = cleanText(body.question, 1500);
  if (question.length < 8) return json({ error: "Please write a little more detail (at least 8 characters)." }, 400);
  const user = await getSessionUser(request, env);
  const name = cleanText(body.name, 80) || cleanText(user?.display_name, 80);
  const email = cleanText(body.email, 160).toLowerCase() || cleanText(user?.email, 160).toLowerCase();
  if (email && (email.includes(" ") || email.indexOf("@") < 1 || email.lastIndexOf(".") < email.indexOf("@") + 2 || email.endsWith("."))) return json({ error: "Please enter a valid email address, or leave it blank." }, 400);
  const language = body.language === "ar" ? "ar" : "en";
  const ip = cleanText(request.headers.get("CF-Connecting-IP"), 80);
  const ipHash = ip ? await sha256Hex(ip) : null;
  const now = new Date(), createdAt = now.toISOString();
  if (ipHash) {
    const windowStart = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const recent = await env.DB.prepare("SELECT COUNT(*) AS count FROM faq_questions WHERE ip_hash = ? AND created_at >= ?").bind(ipHash, windowStart).first();
    if (Number(recent?.count || 0) >= 3) return json({ error: language === "ar" ? "تم إرسال عدة أسئلة مؤخراً. يرجى المحاولة بعد ساعة." : "You've sent several questions recently. Please try again in an hour." }, 429);
  }
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO faq_questions (id,user_id,name,email,question,language,status,ip_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,'new',?,?,?)")
    .bind(id, user?.id || null, name, email, question, language, ipHash, createdAt, createdAt).run();
  return json({ ok: true, message: language === "ar" ? "وصل سؤالك إلى فريق جلسة. شكراً لك!" : "Your question has been sent to the JALSA team. Thank you!" });
}
async function listFaqQuestions(request, env) {
  if (!await requireAdmin(request, env)) return json({ error: "Administrator access required." }, 403);
  await ensureFaqQuestionsSchema(env);
  const result = await env.DB.prepare("SELECT id,user_id,name,email,question,language,status,created_at FROM faq_questions ORDER BY created_at DESC LIMIT 500").all();
  return json({ questions: result.results || [] });
}
async function updateFaqQuestionStatus(request, env, id) {
  if (!await requireAdmin(request, env)) return json({ error: "Administrator access required." }, 403);
  await ensureFaqQuestionsSchema(env);
  const body = await readBody(request), status = cleanText(body.status, 16);
  if (!["new", "reviewed", "resolved"].includes(status)) return json({ error: "Invalid question status." }, 400);
  const existing = await env.DB.prepare("SELECT id FROM faq_questions WHERE id = ? LIMIT 1").bind(id).first();
  if (!existing) return json({ error: "Question not found." }, 404);
  await env.DB.prepare("UPDATE faq_questions SET status = ?, updated_at = ? WHERE id = ?").bind(status, new Date().toISOString(), id).run();
  return json({ ok: true });
}
async function deleteFaqQuestion(request, env, id) {
  if (!await requireAdmin(request, env)) return json({ error: "Administrator access required." }, 403);
  await ensureFaqQuestionsSchema(env);
  const existing = await env.DB.prepare("SELECT id FROM faq_questions WHERE id = ? LIMIT 1").bind(id).first();
  if (!existing) return json({ error: "Question not found." }, 404);
  await env.DB.prepare("DELETE FROM faq_questions WHERE id = ?").bind(id).run();
  return json({ ok: true });
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
  if (action === "grant-subscription") {
    const duration = cleanText(body.duration, 16);
    if (!["1", "3", "6", "12", "unlimited"].includes(duration)) return json({ error: "Choose 1, 3, 6, 12 months, or unlimited access." }, 400);
    await ensureSubscriptionSchema(env);
    const existing = await env.DB.prepare("SELECT plan_code, status, starts_at, expires_at, created_at FROM user_subscriptions WHERE user_id=? LIMIT 1").bind(id).first();
    const existingActive = existing && existing.status === "active" && (!existing.expires_at || existing.expires_at > now);
    if (existingActive && !existing.expires_at && duration !== "unlimited") {
      return json({ ok: true, subscription: { plan_code: "unlimited", status: "active", starts_at: existing.starts_at, expires_at: null } });
    }
    const startsAt = duration === "unlimited" ? now : (existingActive && existing.expires_at ? existing.expires_at : (existingActive ? existing.starts_at : now));
    const months = duration === "unlimited" ? null : Number(duration);
    const expiresAt = months === null ? null : addSubscriptionMonths(new Date(startsAt || now), months).toISOString();
    const planCode = duration === "unlimited" ? "unlimited" : "month_" + duration;
    await env.DB.prepare(
      `INSERT INTO user_subscriptions (user_id, plan_code, status, starts_at, expires_at, granted_by, created_at, updated_at)
       VALUES (?, ?, 'active', ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET plan_code=excluded.plan_code, status='active',
       starts_at=excluded.starts_at, expires_at=excluded.expires_at, granted_by=excluded.granted_by, updated_at=excluded.updated_at`,
    ).bind(id, planCode, duration === "unlimited" ? now : (existingActive ? (existing.starts_at || now) : startsAt), expiresAt, actor.id, existing?.created_at || now, now).run();
    return json({ ok: true, subscription: { plan_code: planCode, status: "active", starts_at: duration === "unlimited" ? now : (existingActive ? (existing.starts_at || now) : startsAt), expires_at: expiresAt } });
  }
  if (action === "revoke-subscription") {
    await ensureSubscriptionSchema(env);
    const result = await env.DB.prepare("UPDATE user_subscriptions SET status='revoked', updated_at=? WHERE user_id=?").bind(now, id).run();
    if (!Number(result.meta?.changes || 0)) return json({ error: "This user has no subscription to revoke." }, 404);
    return json({ ok: true });
  }
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
  await ensureZankoExtendedSchema(env);
  const [cats, questions] = await Promise.all([
    env.DB.prepare("SELECT id, name_en, name_ar, image_url, icon, group_en, group_ar, sort_order FROM game_categories ORDER BY sort_order, name_en").all(),
    env.DB.prepare("SELECT * FROM game_questions ORDER BY created_at, id").all()
  ]);
  return json({ categories: cats.results || [], questions: questions.results || [] });
}
async function getAdminContent(request, env) {
  if (!await requireAdmin(request, env)) return json({ error: "Administrator access required." }, 403);
  await ensureZankoExtendedSchema(env);
  const [cats, questions] = await Promise.all([
    env.DB.prepare("SELECT id, name_en, name_ar, image_url, icon, group_en, group_ar, sort_order FROM game_categories ORDER BY sort_order, name_en").all(),
    env.DB.prepare("SELECT * FROM game_questions ORDER BY game_type, category_id, difficulty, created_at DESC").all()
  ]);
  return json({ categories: cats.results || [], questions: questions.results || [] });
}
async function seedGameContent(request, env) {
  if (!await requireAdmin(request, env)) return json({ error: "Administrator access required." }, 403);
  await ensureZankoExtendedSchema(env);
  const body = await readBody(request), categories = Array.isArray(body.categories) ? body.categories.slice(0, 30) : [], questions = Array.isArray(body.questions) ? body.questions.slice(0, 400) : [];
  const existing = await env.DB.prepare("SELECT COUNT(*) AS count FROM game_questions").first();
  if (Number(existing?.count || 0) > 0) return json({ ok: true, seeded: false });
  if (!categories.length || !questions.length) return json({ error: "Initial game content is missing." }, 400);
  const now = new Date().toISOString(), statements = [];
  for (let i = 0; i < categories.length; i++) {
    const c = categories[i]; if (!/^[a-z0-9_-]{2,48}$/.test(c.id || "") || !cleanText(c.name_en,80)) continue;
    statements.push(env.DB.prepare("INSERT OR IGNORE INTO game_categories (id,name_en,name_ar,image_url,icon,group_en,group_ar,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(c.id, cleanText(c.name_en,80), cleanText(c.name_ar,80), cleanText(c.image_url,500) || null, cleanText(c.icon,12) || "🎯", cleanText(c.group_en,80) || "Other", cleanText(c.group_ar,80) || "أخرى", i, now, now));
  }
  for (const q of questions) {
    const game = q.game_type === "price" ? "price" : "zanko", difficulty = ["easy","medium","hard"].includes(q.difficulty) ? q.difficulty : "medium";
    const mt = q.media_type || "none", mu = cleanText(q.media_url,1000);
    if (game === "zanko" && !categories.some(c => c.id === q.category_id)) continue;
    if (!validMedia(mt, mu)) continue;
    const answerMediaType = game === "zanko" ? (q.answer_media_type || "none") : "none";
    const answerMediaUrl = game === "zanko" ? cleanText(q.answer_media_url,1000) : "";
    if (!["none","image","video"].includes(answerMediaType) || (answerMediaType !== "none" && !validMedia(answerMediaType, answerMediaUrl))) continue;
    statements.push(env.DB.prepare("INSERT OR IGNORE INTO game_questions (id,game_type,category_id,difficulty,question_en,question_ar,answer_en,answer_ar,media_type,media_url,answer_media_type,answer_media_url,product_name_en,product_name_ar,product_emoji,price_value,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(cleanText(q.id,80) || crypto.randomUUID(), game, game === "zanko" ? q.category_id : null, difficulty,
        cleanText(q.question_en,1000), cleanText(q.question_ar,1000), cleanText(q.answer_en,1000), cleanText(q.answer_ar,1000),
        mt, mu || null, answerMediaType, answerMediaUrl || null, cleanText(q.product_name_en,160) || null, cleanText(q.product_name_ar,160) || null, cleanText(q.product_emoji,12) || null,
        q.price_value == null ? null : Number(q.price_value), now, now));
  }
  for (let i = 0; i < statements.length; i += 50) await env.DB.batch(statements.slice(i, i + 50));
  return json({ ok: true, seeded: true, inserted: statements.length });
}
function cleanCategory(body, id) {
  const nameEn = cleanText(body.name_en,80), nameAr = cleanText(body.name_ar,80), imageUrl = cleanText(body.image_url,500);
  if (nameEn.length < 2 || nameAr.length < 2) return { error: "Enter category names in English and Arabic." };
  return { id: id || cleanText(body.id,48) || crypto.randomUUID(), name_en: nameEn, name_ar: nameAr, image_url: imageUrl, icon: cleanText(body.icon,12) || "🎯", group_en: cleanText(body.group_en,80) || "Other", group_ar: cleanText(body.group_ar,80) || "أخرى" };
}
async function createCategory(request, env) {
  if (!await requireAdmin(request, env)) return json({ error: "Administrator access required." }, 403);
  const body = await readBody(request), c = cleanCategory(body);
  if (c.error) return json({ error: c.error }, 400);
  const id = c.id.toLowerCase().replace(/[^a-z0-9_-]/g,"-"), now = new Date().toISOString();
  await ensureZankoExtendedSchema(env);
  await env.DB.prepare("INSERT INTO game_categories (id,name_en,name_ar,image_url,icon,group_en,group_ar,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM game_categories),?,?)")
    .bind(id,c.name_en,c.name_ar,c.image_url || null,c.icon,c.group_en,c.group_ar,now,now).run();
  return json({ ok: true, id });
}
async function updateCategory(request, env, id) {
  if (!await requireAdmin(request, env)) return json({ error: "Administrator access required." }, 403);
  await ensureZankoExtendedSchema(env);
  const body = await readBody(request), c = cleanCategory(body,id);
  if (c.error) return json({ error: c.error },400);
  const previous = await env.DB.prepare("SELECT image_url FROM game_categories WHERE id=? LIMIT 1").bind(id).first();
  await env.DB.prepare("UPDATE game_categories SET name_en=?,name_ar=?,image_url=?,icon=?,group_en=?,group_ar=?,updated_at=? WHERE id=?")
    .bind(c.name_en,c.name_ar,c.image_url || null,c.icon,c.group_en,c.group_ar,new Date().toISOString(),id).run();
  if (previous?.image_url && previous.image_url !== c.image_url) await deleteStoredMedia(env, previous.image_url);
  return json({ok:true});
}
async function deleteCategory(request, env, id) {
  if (!await requireAdmin(request, env)) return json({ error: "Administrator access required." }, 403);
  await ensureZankoExtendedSchema(env);
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
    const answerMediaType=body.answer_media_type||"none",answerMediaUrl=cleanText(body.answer_media_url,1000);
    if (!body.category_id || q.length<3 || !a.length) return {error:"Choose a category and enter the English question and answer."};
    if (!["none","image","video"].includes(answerMediaType) || (answerMediaType!=="none" && !validMedia(answerMediaType,answerMediaUrl))) return {error:"Choose a valid image or video for the answer."};
    return {id:id || crypto.randomUUID(),game_type:game,category_id:cleanText(body.category_id,48),difficulty,question_en:q,question_ar:cleanText(body.question_ar,1000),answer_en:a,answer_ar:cleanText(body.answer_ar,1000),media_type:mediaType,media_url:mediaUrl || null,answer_media_type:answerMediaType,answer_media_url:answerMediaType==="none"?null:answerMediaUrl,product_name_en:null,product_name_ar:null,product_emoji:null,price_value:null};
  }
  const name=cleanText(body.product_name_en,160), price=Number(body.price_value);
  if (name.length<2 || !Number.isFinite(price) || price<=0) return {error:"Enter a product name and a valid price above zero in USD."};
  if (mediaType === "none" || !mediaUrl) return {error:"Add a real product photo or another media file before saving."};
  return {id:id || crypto.randomUUID(),game_type:game,category_id:null,difficulty,question_en:"",question_ar:"",answer_en:"",answer_ar:"",media_type:mediaType,media_url:mediaUrl,answer_media_type:"none",answer_media_url:null,product_name_en:name,product_name_ar:cleanText(body.product_name_ar,160),product_emoji:null,price_value:price};
}
async function createQuestion(request, env) {
  if (!await requireAdmin(request, env)) return json({error:"Administrator access required."},403);
  await ensureZankoExtendedSchema(env);
  const body=await readBody(request),q=cleanQuestion(body);
  if(q.error)return json({error:q.error},400);
  if(q.game_type==="zanko" && !await env.DB.prepare("SELECT id FROM game_categories WHERE id=? LIMIT 1").bind(q.category_id).first())return json({error:"Choose an existing category."},400);
  const now=new Date().toISOString();
  await env.DB.prepare("INSERT INTO game_questions (id,game_type,category_id,difficulty,question_en,question_ar,answer_en,answer_ar,media_type,media_url,answer_media_type,answer_media_url,product_name_en,product_name_ar,product_emoji,price_value,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(q.id,q.game_type,q.category_id,q.difficulty,q.question_en,q.question_ar,q.answer_en,q.answer_ar,q.media_type,q.media_url,q.answer_media_type,q.answer_media_url,q.product_name_en,q.product_name_ar,q.product_emoji,q.price_value,now,now).run();
  return json({ok:true,id:q.id});
}
async function updateQuestion(request, env, id) {
  if (!await requireAdmin(request, env)) return json({error:"Administrator access required."},403);
  await ensureZankoExtendedSchema(env);
  const body=await readBody(request),q=cleanQuestion(body,id);
  if(q.error)return json({error:q.error},400);
  if(q.game_type==="zanko" && !await env.DB.prepare("SELECT id FROM game_categories WHERE id=? LIMIT 1").bind(q.category_id).first())return json({error:"Choose an existing category."},400);
  const previous = await env.DB.prepare("SELECT media_url,answer_media_url FROM game_questions WHERE id=? LIMIT 1").bind(id).first();
  await env.DB.prepare("UPDATE game_questions SET game_type=?,category_id=?,difficulty=?,question_en=?,question_ar=?,answer_en=?,answer_ar=?,media_type=?,media_url=?,answer_media_type=?,answer_media_url=?,product_name_en=?,product_name_ar=?,product_emoji=?,price_value=?,updated_at=? WHERE id=?")
    .bind(q.game_type,q.category_id,q.difficulty,q.question_en,q.question_ar,q.answer_en,q.answer_ar,q.media_type,q.media_url,q.answer_media_type,q.answer_media_url,q.product_name_en,q.product_name_ar,q.product_emoji,q.price_value,new Date().toISOString(),id).run();
  if (previous?.media_url && previous.media_url !== q.media_url) await deleteStoredMedia(env, previous.media_url);
  if (previous?.answer_media_url && previous.answer_media_url !== q.answer_media_url) await deleteStoredMedia(env, previous.answer_media_url);
  return json({ok:true});
}
async function deleteQuestion(request, env, id) {
  if (!await requireAdmin(request, env)) return json({error:"Administrator access required."},403);
  await ensureZankoExtendedSchema(env);
  const previous = await env.DB.prepare("SELECT media_url,answer_media_url FROM game_questions WHERE id=? LIMIT 1").bind(id).first();
  await env.DB.prepare("DELETE FROM game_questions WHERE id=?").bind(id).run();
  if (previous?.media_url) await deleteStoredMedia(env, previous.media_url);
  if (previous?.answer_media_url) await deleteStoredMedia(env, previous.answer_media_url);
  return json({ok:true});
}


/* JALSA Kharj Al Jalsa: one-phone pass-and-play outsider game */
const KHARJ_CATEGORIES = [
  {id:"animals",en:"Animals",ar:"الحيوانات"},
  {id:"foods",en:"Foods",ar:"الأطعمة"},
  {id:"electronics",en:"Electronics",ar:"الإلكترونيات"},
  {id:"english-celebrities",en:"English Celebrities",ar:"مشاهير عالميون"},
  {id:"arabic-celebrities",en:"Arabic Celebrities",ar:"مشاهير عرب"},
  {id:"countries",en:"Countries",ar:"الدول"},
  {id:"fruit-vegetables",en:"Fruits & Vegetables",ar:"الفواكه والخضروات"},
  {id:"sports",en:"Sports",ar:"الرياضة"},
  {id:"hobbies",en:"Hobbies",ar:"الهوايات"},
  {id:"jobs",en:"Jobs",ar:"الوظائف"}
];
const KHARJ_WORD_BANK = {
 animals:[["Lion","أسد"],["Elephant","فيل"],["Giraffe","زرافة"],["Dolphin","دلفين"],["Penguin","بطريق"],["Camel","جمل"],["Tiger","نمر"],["Wolf","ذئب"],["Panda","باندا"],["Kangaroo","كنغر"],["Octopus","أخطبوط"],["Crocodile","تمساح"],["Eagle","نسر"],["Owl","بومة"],["Rabbit","أرنب"],["Horse","حصان"],["Fox","ثعلب"],["Whale","حوت"],["Flamingo","فلامنغو"],["Cheetah","فهد"]],
 foods:[["Pizza","بيتزا"],["Sushi","سوشي"],["Burger","برغر"],["Shawarma","شاورما"],["Falafel","فلافل"],["Pancakes","بان كيك"],["Pasta","معكرونة"],["Tacos","تاكو"],["Hummus","حمص"],["Biryani","برياني"],["Lasagna","لازانيا"],["Croissant","كرواسون"],["Fried chicken","دجاج مقلي"],["Ramen","رامن"],["Kebab","كباب"],["Ice cream","آيس كريم"],["Donuts","دونات"],["Mansaf","منسف"],["Kabsa","كبسة"],["Mac and cheese","ماك آند تشيز"]],
 electronics:[["iPhone","آيفون"],["PlayStation 5","بلايستيشن 5"],["Nintendo Switch 2","نينتندو سويتش 2"],["MacBook","ماك بوك"],["AirPods","إيربودز"],["Smartwatch","ساعة ذكية"],["Digital camera","كاميرا رقمية"],["Laptop","لابتوب"],["Drone","درون"],["VR headset","نظارة واقع افتراضي"],["Tablet","جهاز لوحي"],["Smart TV","تلفزيون ذكي"],["Gaming PC","كمبيوتر ألعاب"],["Keyboard","لوحة مفاتيح"],["Computer mouse","فأرة كمبيوتر"],["Microphone","ميكروفون"],["Power bank","شاحن متنقل"],["Projector","جهاز عرض"],["Robot vacuum","مكنسة روبوت"],["Headphones","سماعات"]],
 "english-celebrities":[["Ariana Grande","أريانا غراندي"],["Taylor Swift","تايلور سويفت"],["The Weeknd","ذا ويكند"],["Billie Eilish","بيلي آيليش"],["Rihanna","ريهانا"],["Beyoncé","بيونسيه"],["Drake","دريك"],["Justin Bieber","جاستن بيبر"],["Selena Gomez","سيلينا غوميز"],["Zendaya","زندايا"],["Tom Holland","توم هولاند"],["Leonardo DiCaprio","ليوناردو دي كابريو"],["Dwayne Johnson","دوين جونسون"],["Kim Kardashian","كيم كارداشيان"],["Ed Sheeran","إد شيران"],["Lady Gaga","ليدي غاغا"],["Harry Styles","هاري ستايلز"],["Cristiano Ronaldo","كريستيانو رونالدو"],["Lionel Messi","ليونيل ميسي"],["Ice Spice","آيس سبايس"]],
 "arabic-celebrities":[["Amr Diab","عمرو دياب"],["Nancy Ajram","نانسي عجرم"],["Mohamed Ramadan","محمد رمضان"],["Tamer Hosny","تامر حسني"],["Elissa","إليسا"],["Fairuz","فيروز"],["Kadim Al Sahir","كاظم الساهر"],["Assala","أصالة"],["Balqees","بلقيس"],["Hussain Al Jassmi","حسين الجسمي"],["Ahmed Helmy","أحمد حلمي"],["Adel Imam","عادل إمام"],["Mona Zaki","منى زكي"],["Yasmine Sabri","ياسمين صبري"],["Wael Kfoury","وائل كفوري"],["Ragheb Alama","راغب علامة"],["Saad Lamjarred","سعد لمجرد"],["Cyrine Abdelnour","سيرين عبد النور"],["Majida El Roumi","ماجدة الرومي"],["Nassif Zeytoun","ناصيف زيتون"]],
 countries:[["Jordan","الأردن"],["United Arab Emirates","الإمارات العربية المتحدة"],["Palestine","فلسطين"],["Saudi Arabia","السعودية"],["Egypt","مصر"],["Turkey","تركيا"],["Japan","اليابان"],["South Korea","كوريا الجنوبية"],["Italy","إيطاليا"],["France","فرنسا"],["Brazil","البرازيل"],["Canada","كندا"],["Australia","أستراليا"],["Spain","إسبانيا"],["Germany","ألمانيا"],["Greece","اليونان"],["Morocco","المغرب"],["Lebanon","لبنان"],["Qatar","قطر"],["United States","الولايات المتحدة"]],
 "fruit-vegetables":[["Apple","تفاح"],["Banana","موز"],["Watermelon","بطيخ"],["Mango","مانجو"],["Pineapple","أناناس"],["Strawberry","فراولة"],["Grapes","عنب"],["Kiwi","كيوي"],["Peach","خوخ"],["Avocado","أفوكادو"],["Cucumber","خيار"],["Carrot","جزر"],["Potato","بطاطا"],["Tomato","طماطم"],["Broccoli","بروكلي"],["Cauliflower","قرنبيط"],["Eggplant","باذنجان"],["Bell pepper","فلفل حلو"],["Corn","ذرة"],["Pumpkin","يقطين"]],
 sports:[["Football","كرة القدم"],["Basketball","كرة السلة"],["Tennis","التنس"],["Swimming","السباحة"],["Boxing","الملاكمة"],["Volleyball","الكرة الطائرة"],["Cricket","الكريكيت"],["Formula 1","فورمولا 1"],["Gymnastics","الجمباز"],["Badminton","الريشة الطائرة"],["Golf","الغولف"],["Cycling","ركوب الدراجات"],["Wrestling","المصارعة"],["Skiing","التزلج"],["Surfing","ركوب الأمواج"],["Table tennis","تنس الطاولة"],["Rugby","الرجبي"],["Ice hockey","هوكي الجليد"],["Taekwondo","التايكوندو"],["Horse riding","ركوب الخيل"]],
 hobbies:[["Photography","التصوير"],["Gaming","ألعاب الفيديو"],["Painting","الرسم"],["Reading","القراءة"],["Cooking","الطبخ"],["Gardening","البستنة"],["Dancing","الرقص"],["Singing","الغناء"],["Fishing","الصيد"],["Hiking","المشي الجبلي"],["Baking","الخبز"],["Knitting","الحياكة"],["Coin collecting","جمع العملات"],["Playing piano","عزف البيانو"],["Writing","الكتابة"],["Skateboarding","التزلج على اللوح"],["Pottery","صناعة الفخار"],["Birdwatching","مراقبة الطيور"],["Swimming","السباحة"],["Origami","الأوريغامي"]],
 jobs:[["Doctor","طبيب"],["Teacher","معلم"],["Firefighter","رجل إطفاء"],["Police officer","شرطي"],["Chef","طاهٍ"],["Pilot","طيار"],["Dentist","طبيب أسنان"],["Engineer","مهندس"],["Architect","مهندس معماري"],["Photographer","مصور"],["Actor","ممثل"],["Singer","مغنٍ"],["Lawyer","محامٍ"],["Nurse","ممرض"],["Mechanic","ميكانيكي"],["Farmer","مزارع"],["Astronaut","رائد فضاء"],["Journalist","صحفي"],["Programmer","مبرمج"],["Footballer","لاعب كرة قدم"]]
};
const KHARJ_EXTRA_WORD_BANK = {"animals":[["Zebra","حمار وحشي"],["Gorilla","غوريلا"],["Koala","كوالا"],["Leopard","نمر مرقط"],["Rhinoceros","وحيد القرن"],["Hippopotamus","فرس النهر"],["Deer","أيل"],["Moose","أيل الموظ"],["Bison","بيسون"],["Hyena","ضبع"],["Meerkat","سرقاط"],["Lemur","ليمور"],["Sloth","كسلان"],["Porcupine","نيص"],["Hedgehog","قنفذ"],["Squirrel","سنجاب"],["Beaver","قندس"],["Otter","قضاعة"],["Seal","فقمة"],["Sea lion","أسد البحر"],["Shark","قرش"],["Stingray","شفنين"],["Seahorse","فرس البحر"],["Jellyfish","قنديل البحر"],["Starfish","نجم البحر"],["Lobster","كركند"],["Crab","سلطعون"],["Peacock","طاووس"],["Parrot","ببغاء"],["Toucan","طوقان"],["Falcon","صقر"],["Hawk","باشق"],["Swan","بجعة"],["Ostrich","نعامة"],["Emu","إيمو"],["Pelican","بجع"],["Woodpecker","نقّار الخشب"],["Turkey","ديك رومي"],["Rooster","ديك"],["Iguana","إغوانا"],["Gecko","وزغة"],["Chameleon","حرباء"],["Python","أفعى الأصلة"],["Cobra","كوبرا"],["Tortoise","سلحفاة برية"],["Butterfly","فراشة"],["Bee","نحلة"],["Ladybug","دعسوقة"],["Scorpion","عقرب"],["Ant","نملة"]],"foods":[["Dumplings","فطائر محشوة"],["Paella","باييّا"],["Risotto","ريزوتو"],["Gnocchi","نيوكي"],["Enchiladas","إنشيلادا"],["Burrito","بوريتو"],["Quesadilla","كيساديّا"],["Nachos","ناتشوز"],["Hot dog","هوت دوغ"],["Meatballs","كرات اللحم"],["Steak","شريحة لحم"],["Grilled salmon","سلمون مشوي"],["Fried rice","أرز مقلي"],["Spring rolls","لفائف الربيع"],["Pho","فو"],["Bibimbap","بيبيمباب"],["Kimchi","كيمتشي"],["Curry","كاري"],["Butter chicken","دجاج بالزبدة"],["Tikka masala","تيكا ماسالا"],["Moussaka","مسقعة"],["Dolma","دولمة"],["Kibbeh","كبة"],["Tabbouleh","تبولة"],["Fattoush","فتوش"],["Mutabbal","متبل"],["Kunafa","كنافة"],["Baklava","بقلاوة"],["Maamoul","معمول"],["Qatayef","قطايف"],["Basbousa","بسبوسة"],["Rice pudding","أرز بالحليب"],["Cheesecake","تشيزكيك"],["Brownie","براوني"],["Muffins","مافن"],["Waffles","وافل"],["French toast","توست فرنسي"],["Crepe","كريب"],["Apple pie","فطيرة التفاح"],["Tiramisu","تيراميسو"],["Churros","تشوروز"],["Gelato","جيلاتو"],["Mochi","موتشي"],["Macarons","ماكرون"],["Pretzel","بريتزل"],["Bagel","بيغل"],["Omelette","عجة"],["Scrambled eggs","بيض مخفوق"],["Corn dog","كورن دوغ"],["Stuffed grape leaves","ورق عنب محشي"]],"electronics":[["Bluetooth speaker","مكبر صوت بلوتوث"],["Soundbar","مكبر صوت تلفزيوني"],["Smart speaker","مكبر صوت ذكي"],["E-reader","قارئ إلكتروني"],["Smart ring","خاتم ذكي"],["Fitness tracker","سوار تتبع اللياقة"],["4K monitor","شاشة 4K"],["Ultrawide monitor","شاشة عريضة جداً"],["Graphics tablet","لوح رسم رقمي"],["Drawing tablet","لوحة رسم إلكترونية"],["External SSD","قرص SSD خارجي"],["USB flash drive","ذاكرة USB"],["Network-attached storage","وحدة تخزين شبكية"],["Wi-Fi router","جهاز توجيه واي فاي"],["Mesh Wi-Fi system","نظام واي فاي شبكي"],["Modem","مودم"],["Security camera","كاميرا مراقبة"],["Video doorbell","جرس باب بكاميرا"],["Smart lock","قفل ذكي"],["Smart thermostat","منظم حرارة ذكي"],["Smart light bulb","مصباح ذكي"],["Air purifier","منقي هواء"],["3D printer","طابعة ثلاثية الأبعاد"],["Action camera","كاميرا حركة"],["Instant camera","كاميرا فورية"],["Mirrorless camera","كاميرا بدون مرآة"],["Telephoto lens","عدسة تقريب"],["Capture card","بطاقة التقاط فيديو"],["Stream deck","لوحة تحكم للبث"],["Audio interface","واجهة صوتية"],["Studio monitor speaker","مكبر صوت استوديو"],["Condenser microphone","ميكروفون مكثف"],["USB microphone","ميكروفون USB"],["MIDI keyboard","لوحة مفاتيح MIDI"],["Turntable","مشغل أسطوانات"],["Portable monitor","شاشة محمولة"],["Docking station","محطة إرساء"],["USB-C hub","موزع USB-C"],["Smart display","شاشة ذكية"],["Smart glasses","نظارات ذكية"],["Electric toothbrush","فرشاة أسنان كهربائية"],["Digital photo frame","إطار صور رقمي"],["GPS navigator","جهاز ملاحة GPS"],["Dash camera","كاميرا سيارة أمامية"],["Portable power station","محطة طاقة محمولة"],["Wireless charger","شاحن لاسلكي"],["Gaming steering wheel","عجلة قيادة للألعاب"],["Flight simulator joystick","عصا تحكم لمحاكاة الطيران"],["Home theater receiver","مستقبل مسرح منزلي"],["Electronic drum kit","طقم طبول إلكتروني"]],"english-celebrities":[["Olivia Rodrigo","أوليفيا رودريغو"],["Sabrina Carpenter","سابرينا كاربنتر"],["Dua Lipa","دوا ليبا"],["Miley Cyrus","مايلي سايرس"],["Katy Perry","كاتي بيري"],["Adele","أديل"],["Bruno Mars","برونو مارس"],["Post Malone","بوست مالون"],["Eminem","إمينيم"],["Kendrick Lamar","كيندريك لامار"],["Travis Scott","ترافيس سكوت"],["Cardi B","كاردي بي"],["Nicki Minaj","نيكي ميناج"],["Doja Cat","دوجا كات"],["SZA","إس زي إيه"],["Shawn Mendes","شون مينديز"],["Charlie Puth","تشارلي بوث"],["Camila Cabello","كاميلا كابيو"],["Halsey","هالسي"],["Sam Smith","سام سميث"],["Jennifer Lopez","جينيفر لوبيز"],["Britney Spears","بريتني سبيرز"],["Christina Aguilera","كريستينا أغيليرا"],["Madonna","مادونا"],["Cher","شير"],["Celine Dion","سيلين ديون"],["Alicia Keys","أليشيا كيز"],["Gwen Stefani","غوين ستيفاني"],["Lana Del Rey","لانا ديل راي"],["Millie Bobby Brown","ميلي بوبي براون"],["Jenna Ortega","جينا أورتيغا"],["Emma Watson","إيما واتسون"],["Margot Robbie","مارغو روبي"],["Ryan Reynolds","رايان رينولدز"],["Ryan Gosling","رايان غوسلينغ"],["Robert Downey Jr.","روبرت داوني جونيور"],["Chris Evans","كريس إيفانز"],["Chris Hemsworth","كريس هيمسوورث"],["Scarlett Johansson","سكارليت جوهانسون"],["Jennifer Lawrence","جينيفر لورانس"],["Anne Hathaway","آن هاثاواي"],["Timothée Chalamet","تيموثي شالاميه"],["Florence Pugh","فلورنس بيو"],["Pedro Pascal","بيدرو باسكال"],["Keanu Reeves","كيانو ريفز"],["Tom Cruise","توم كروز"],["Brad Pitt","براد بيت"],["Angelina Jolie","أنجلينا جولي"],["Meryl Streep","ميريل ستريب"],["Johnny Depp","جوني ديب"]],"arabic-celebrities":[["Assi El Hallani","عاصي الحلاني"],["Melhem Zein","ملحم زين"],["Myriam Fares","ميريام فارس"],["Haifa Wehbe","هيفاء وهبي"],["Sherine Abdel Wahab","شيرين عبد الوهاب"],["Ruby","روبي"],["Angham","أنغام"],["Mohamed Mounir","محمد منير"],["Hany Shaker","هاني شاكر"],["Ramy Sabry","رامي صبري"],["Mahmoud El Esseily","محمود العسيلي"],["Wegz","ويجز"],["Marwan Pablo","مروان بابلو"],["Marwan Moussa","مروان موسى"],["Ahmed Ezz","أحمد عز"],["Karim Abdel Aziz","كريم عبد العزيز"],["Mohamed Henedy","محمد هنيدي"],["Donia Samir Ghanem","دنيا سمير غانم"],["Saba Mubarak","صبا مبارك"],["Nadine Njeim","نادين نسيب نجيم"],["Carmen Bsaibes","كارمن بصيبص"],["Yousra","يسرا"],["Rania Youssef","رانيا يوسف"],["Menna Shalaby","منة شلبي"],["Asser Yassin","آسر ياسين"],["Ahmed Dawood","أحمد داود"],["Eyad Nassar","إياد نصار"],["Dhafer L'Abidine","ظافر العابدين"],["Amina Khalil","أمينة خليل"],["Tara Emad","تارا عماد"],["Ahmed Malek","أحمد مالك"],["Mohamed Farrag","محمد فراج"],["Amr Youssef","عمرو يوسف"],["Ahmed Fahmy","أحمد فهمي"],["Hisham Maged","هشام ماجد"],["Chico","شيكو"],["Bayoumi Fouad","بيومي فؤاد"],["Ahmed Saad","أحمد سعد"],["Majid Al Mohandis","ماجد المهندس"],["Ahlam","أحلام"],["Nawal El Kuwaitia","نوال الكويتية"],["Dalia Mubarak","داليا مبارك"],["Abdul Majeed Abdullah","عبد المجيد عبد الله"],["Rashed Al Majed","راشد الماجد"],["Ziad Bourji","زياد برجي"],["Marwan Khoury","مروان خوري"],["Wael Jassar","وائل جسار"],["Fadel Shaker","فضل شاكر"],["Diana Haddad","ديانا حداد"],["Jannat","جنات"]],"countries":[["United Kingdom","المملكة المتحدة"],["China","الصين"],["India","الهند"],["Mexico","المكسيك"],["Argentina","الأرجنتين"],["Chile","تشيلي"],["Peru","بيرو"],["Colombia","كولومبيا"],["Uruguay","أوروغواي"],["Portugal","البرتغال"],["Netherlands","هولندا"],["Belgium","بلجيكا"],["Switzerland","سويسرا"],["Austria","النمسا"],["Sweden","السويد"],["Norway","النرويج"],["Finland","فنلندا"],["Denmark","الدنمارك"],["Ireland","أيرلندا"],["Poland","بولندا"],["Ukraine","أوكرانيا"],["Russia","روسيا"],["Thailand","تايلاند"],["Malaysia","ماليزيا"],["Singapore","سنغافورة"],["Indonesia","إندونيسيا"],["Philippines","الفلبين"],["Vietnam","فيتنام"],["Pakistan","باكستان"],["Bangladesh","بنغلاديش"],["Sri Lanka","سريلانكا"],["Nepal","نيبال"],["Afghanistan","أفغانستان"],["Iran","إيران"],["Iraq","العراق"],["Kuwait","الكويت"],["Bahrain","البحرين"],["Oman","عُمان"],["Yemen","اليمن"],["Tunisia","تونس"],["Algeria","الجزائر"],["Libya","ليبيا"],["Sudan","السودان"],["Ethiopia","إثيوبيا"],["Kenya","كينيا"],["Nigeria","نيجيريا"],["Ghana","غانا"],["South Africa","جنوب أفريقيا"],["New Zealand","نيوزيلندا"],["Iceland","آيسلندا"]],"fruit-vegetables":[["Orange","برتقال"],["Lemon","ليمون"],["Lime","ليمون أخضر"],["Grapefruit","جريب فروت"],["Papaya","بابايا"],["Pear","كمثرى"],["Plum","برقوق"],["Cherry","كرز"],["Raspberry","توت العليق"],["Blueberry","توت أزرق"],["Blackberry","توت أسود"],["Pomegranate","رمان"],["Fig","تين"],["Date","تمر"],["Coconut","جوز الهند"],["Guava","جوافة"],["Passion fruit","فاكهة العاطفة"],["Dragon fruit","فاكهة التنين"],["Lychee","ليتشي"],["Apricot","مشمش"],["Cantaloupe","شمام"],["Honeydew melon","شمام أخضر"],["Cranberry","توت بري"],["Tangerine","يوسفي"],["Clementine","كلمنتينا"],["Persimmon","كاكا"],["Quince","سفرجل"],["Mulberry","توت"],["Starfruit","فاكهة النجمة"],["Jackfruit","جاك فروت"],["Breadfruit","فاكهة الخبز"],["Durian","دوريان"],["Plantain","موز الطبخ"],["Beetroot","شمندر"],["Spinach","سبانخ"],["Lettuce","خس"],["Kale","كرنب أجعد"],["Cabbage","ملفوف"],["Red cabbage","ملفوف أحمر"],["Zucchini","كوسا"],["Radish","فجل"],["Turnip","لفت"],["Sweet potato","بطاطا حلوة"],["Onion","بصل"],["Garlic","ثوم"],["Ginger","زنجبيل"],["Celery","كرفس"],["Asparagus","هليون"],["Artichoke","خرشوف"],["Green beans","فاصولياء خضراء"]],"sports":[["Athletics","ألعاب القوى"],["Sprinting","العدو السريع"],["Marathon running","الجري لمسافات طويلة"],["Archery","الرماية بالقوس"],["Fencing","المبارزة"],["Rowing","التجديف"],["Canoeing","التجديف بالكانو"],["Kayaking","التجديف بالكاياك"],["Sailing","الإبحار"],["Snowboarding","التزلج على اللوح الثلجي"],["Figure skating","التزلج الفني"],["Speed skating","التزلج السريع"],["Handball","كرة اليد"],["Baseball","البيسبول"],["Softball","الكرة اللينة"],["American football","كرة القدم الأمريكية"],["Futsal","كرة الصالات"],["Squash","الإسكواش"],["Racquetball","راكت بول"],["Pickleball","بيكل بول"],["Darts","لعبة السهام"],["Bowling","البولينغ"],["Snooker","السنوكر"],["Billiards","البلياردو"],["Karate","الكاراتيه"],["Judo","الجودو"],["Brazilian jiu-jitsu","الجوجيتسو البرازيلية"],["Kickboxing","الكيك بوكسينغ"],["Muay Thai","المواي تاي"],["Mixed martial arts","الفنون القتالية المختلطة"],["Weightlifting","رفع الأثقال"],["Powerlifting","القوة البدنية"],["Pole vault","القفز بالزانة"],["Long jump","الوثب الطويل"],["High jump","الوثب العالي"],["Shot put","دفع الجلة"],["Discus throw","رمي القرص"],["Javelin throw","رمي الرمح"],["Triathlon","الترياتلون"],["Modern pentathlon","الخماسي الحديث"],["Equestrian","الفروسية"],["Dressage","الترويض"],["Show jumping","قفز الحواجز"],["Water polo","كرة الماء"],["Springboard diving","الغوص من منصة متحركة"],["BMX racing","سباق الدراجات BMX"],["Motocross","سباق الدراجات النارية الترابية"],["Rally racing","سباق الرالي"],["Rock climbing","تسلق الصخور"],["Parkour","الباركور"]],"hobbies":[["Journaling","كتابة اليوميات"],["Scrapbooking","صناعة ألبومات الذكريات"],["Calligraphy","فن الخط"],["Candle making","صناعة الشموع"],["Soap making","صناعة الصابون"],["Woodworking","النجارة كهواية"],["Model building","تركيب المجسمات"],["Stamp collecting","جمع الطوابع"],["Sneaker collecting","جمع الأحذية الرياضية"],["Astronomy","علم الفلك"],["Stargazing","مراقبة النجوم"],["Chess","الشطرنج"],["Jigsaw puzzles","تركيب أحجيات الصور"],["Crossword puzzles","حل الكلمات المتقاطعة"],["Learning languages","تعلم اللغات"],["Podcasting","إنتاج البودكاست"],["Blogging","التدوين"],["Video editing","تحرير الفيديو"],["Animation","التحريك والأنيميشن"],["Coding","البرمجة"],["3D printing","الطباعة ثلاثية الأبعاد"],["Sewing","الخياطة"],["Embroidery","التطريز"],["Quilting","ترقيع الأقمشة"],["Leather crafting","صناعة المنتجات الجلدية"],["Jewelry making","صناعة المجوهرات"],["Flower arranging","تنسيق الزهور"],["Terrarium making","صناعة الحدائق الزجاجية"],["Bonsai growing","زراعة البونساي"],["Beekeeping","تربية النحل"],["Home decorating","تزيين المنزل"],["Car restoration","ترميم السيارات"],["Motorcycle maintenance","صيانة الدراجات النارية"],["Geocaching","البحث عن الكنز بالإحداثيات"],["Metal detecting","البحث عن المعادن"],["Rock collecting","جمع الصخور"],["Magic tricks","الخدع السحرية"],["Cardistry","فن استعراض أوراق اللعب"],["Board games","ألعاب الطاولة"],["Tabletop role-playing","ألعاب تقمص الأدوار"],["Cosplay","الأزياء التنكرية"],["Drone flying","قيادة الطائرات المسيّرة"],["Comic book collecting","جمع القصص المصورة"],["Vinyl record collecting","جمع أسطوانات الفينيل"],["Urban sketching","الرسم في الأماكن العامة"],["Filmmaking","صناعة الأفلام"],["Amateur radio","هواية الراديو"],["Volunteering","العمل التطوعي"],["Birdhouse building","صناعة بيوت الطيور"],["Speedcubing","حل مكعب روبيك بسرعة"]],"jobs":[["Pharmacist","صيدلي"],["Veterinarian","طبيب بيطري"],["Surgeon","جرّاح"],["Pediatrician","طبيب أطفال"],["Dermatologist","طبيب جلدية"],["Cardiologist","طبيب قلب"],["Paramedic","مسعف"],["Psychologist","أخصائي نفسي"],["Physical therapist","أخصائي علاج طبيعي"],["Optometrist","أخصائي بصريات"],["Radiologist","طبيب أشعة"],["Midwife","قابلة"],["Flight attendant","مضيف طيران"],["Air traffic controller","مراقب حركة جوية"],["Ship captain","قبطان سفينة"],["Train driver","سائق قطار"],["Bus driver","سائق حافلة"],["Truck driver","سائق شاحنة"],["Electrician","كهربائي"],["Plumber","سباك"],["Carpenter","نجار"],["Welder","لحّام"],["House painter","دهّان"],["Tailor","خيّاط"],["Barber","حلاق"],["Hairdresser","مصفف شعر"],["Makeup artist","خبير مكياج"],["Fashion designer","مصمم أزياء"],["Interior designer","مصمم ديكور"],["Graphic designer","مصمم جرافيك"],["Web developer","مطوّر مواقع"],["Data analyst","محلل بيانات"],["Software tester","مختبر برمجيات"],["Cybersecurity analyst","محلل أمن سيبراني"],["Civil engineer","مهندس مدني"],["Electrical engineer","مهندس كهربائي"],["Accountant","محاسب"],["Banker","مصرفي"],["Economist","خبير اقتصادي"],["Professor","أستاذ جامعي"],["Librarian","أمين مكتبة"],["Translator","مترجم"],["Interpreter","مترجم فوري"],["Editor","محرر"],["News anchor","مذيع أخبار"],["Waiter","نادل"],["Hotel manager","مدير فندق"],["Travel agent","وكيل سفر"],["Real estate agent","وكيل عقارات"],["Social worker","أخصائي اجتماعي"]]};

async function ensureKharjSchema(env){
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS kharj_rooms (room_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, host_user_id TEXT NOT NULL, state_json TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, ended_at TEXT)").run();
 await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_kharj_rooms_host ON kharj_rooms(host_user_id,created_at)").run();
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS kharj_words (id TEXT PRIMARY KEY, category_id TEXT NOT NULL, word_en TEXT NOT NULL, word_ar TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
 await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_kharj_words_category ON kharj_words(category_id,word_en)").run();
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS kharj_word_seed (id INTEGER PRIMARY KEY CHECK(id=1), seeded_at TEXT NOT NULL)").run();
 const now=new Date().toISOString();
 const seeded=await env.DB.prepare("SELECT id FROM kharj_word_seed WHERE id=1").first();
 if(!seeded){
  const statements=[];
  for(const category of KHARJ_CATEGORIES){
   const words=KHARJ_WORD_BANK[category.id]||[];
   words.forEach((word,index)=>statements.push(
    env.DB.prepare("INSERT OR IGNORE INTO kharj_words (id,category_id,word_en,word_ar,created_at,updated_at) VALUES (?,?,?,?,?,?)").bind("seed_"+category.id+"_"+(index+1),category.id,word[0],word[1]||null,now,now)
   ));
  }
  for(let i=0;i<statements.length;i+=50)await env.DB.batch(statements.slice(i,i+50));
  await env.DB.prepare("INSERT OR IGNORE INTO kharj_word_seed (id,seeded_at) VALUES (1,?)").bind(now).run();
 }
 // Versioned incremental seed: adds 50 fresh words to every existing Kharj category once.
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS kharj_word_seed_versions (version TEXT PRIMARY KEY, seeded_at TEXT NOT NULL)").run();
 const extraVersion="kharj-extra-50-v1";
 const extraSeeded=await env.DB.prepare("SELECT version FROM kharj_word_seed_versions WHERE version=?").bind(extraVersion).first();
 if(!extraSeeded){
  const statements=[];
  for(const category of KHARJ_CATEGORIES){
   const words=KHARJ_EXTRA_WORD_BANK[category.id]||[];
   if(words.length!==50)throw new Error("Kharj extra word seed must contain exactly 50 words for "+category.id);
   words.forEach((word,index)=>statements.push(
    env.DB.prepare("INSERT OR IGNORE INTO kharj_words (id,category_id,word_en,word_ar,created_at,updated_at) VALUES (?,?,?,?,?,?)").bind("seed_extra50_"+category.id+"_"+(index+1),category.id,word[0],word[1]||null,now,now)
   ));
  }
  for(let i=0;i<statements.length;i+=50)await env.DB.batch(statements.slice(i,i+50));
  await env.DB.prepare("INSERT OR IGNORE INTO kharj_word_seed_versions (version,seeded_at) VALUES (?,?)").bind(extraVersion,now).run();
 }
}
function kharjShuffle(items){
 const a=[...items];
 for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
 return a;
}
function kharjCategory(id){return KHARJ_CATEGORIES.find(c=>c.id===id)||null}
function kharjNormalizeGuess(value){
 return String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase().replace(/[.,!?؛،:'"’‘()\-_/]/g,"").replace(/\s+/g," ").trim();
}
async function kharjChooseSecret(state,env){
 const rows=await env.DB.prepare("SELECT id,category_id,word_en,word_ar FROM kharj_words ORDER BY category_id,word_en").all();
 const categories=new Set(state.categories||[]);
 const pool=(rows.results||[]).filter(row=>categories.has(row.category_id)).map(row=>({id:row.id,categoryId:row.category_id,wordEn:row.word_en,wordAr:row.word_ar||row.word_en}));
 const unused=pool.filter(item=>!(state.usedWordIds||[]).includes(item.id));
 return kharjShuffle(unused.length?unused:pool)[0]||null;
}
async function kharjStartRound(state,env){
 const secret=await kharjChooseSecret(state,env);
 if(!secret)throw new Error("No words are available for the selected category. Add words in Dashboard → Game editor → Kharj editor.");
 state.secret=secret;state.usedWordIds=[...(state.usedWordIds||[]),secret.id].slice(-250);
 state.outsiderId=kharjShuffle(state.players)[0].id;
 state.stage="revealing";state.revealIndex=0;state.revealed=false;state.askRound=0;state.askerId=null;state.askTargetId=null;state.specialPick=false;state.lastQuestion=null;state.votes={};state.voteIndex=0;state.voteSummary=null;state.guess="";state.outcome=null;state.caughtPlayerId=null;state.round=(state.round||0)+1;
}
function kharjBeginDiscussion(state){
 state.stage="discussion";state.askRound=1;state.askerId=kharjShuffle(state.players)[0]?.id||null;state.askTargetId=kharjShuffle((state.players||[]).filter(p=>p.id!==state.askerId))[0]?.id||null;state.specialPick=false;state.lastQuestion=state.askerId&&state.askTargetId?{askerId:state.askerId,targetId:state.askTargetId}:null;
}
function kharjNextAsker(state){
 const players=state.players||[],previous=state.askerId,pool=players.filter(p=>p.id!==previous);
 state.askerId=kharjShuffle(pool.length?pool:players)[0]?.id||null;
 state.askRound=(state.askRound||1)+1;
 state.specialPick=state.askRound>=6;
 if(state.specialPick){state.askTargetId=null;state.lastQuestion=null;return}
 state.askTargetId=kharjShuffle(players.filter(p=>p.id!==state.askerId))[0]?.id||null;
 state.lastQuestion=state.askerId&&state.askTargetId?{askerId:state.askerId,targetId:state.askTargetId}:null;
}
async function createKharjRoom(request,env){
 const user=await getSessionUser(request,env);
 if(!user)return json({error:"Please sign in to host Kharj Al Jalsa."},401);
 await ensureKharjSchema(env);
 const roomId=toBase64Url(randomBytes(18)),key=toBase64Url(randomBytes(32)),now=new Date(),expires=new Date(now.getTime()+3*60*60*1000).toISOString();
 const state={stage:"setup",language:"en",players:[],categories:[],round:0,usedWordIds:[],secret:null,outsiderId:null,revealIndex:0,revealed:false,askRound:0,askerId:null,askTargetId:null,specialPick:false,lastQuestion:null,votes:{},voteIndex:0,voteSummary:null,outcome:null};
 await env.DB.prepare("INSERT INTO kharj_rooms (room_id,token_hash,host_user_id,state_json,created_at,expires_at) VALUES (?,?,?,?,?,?)").bind(roomId,await sha256Hex(key),user.id,JSON.stringify(state),now.toISOString(),expires).run();
 return json({roomId,key,expiresAt:expires});
}
async function kharjRoomByKey(body,env){
 const roomId=String(body.roomId||""),key=String(body.key||"");
 if(!/^[A-Za-z0-9_-]{20,40}$/.test(roomId)||key.length<40||key.length>60)return null;
 await ensureKharjSchema(env);
 const row=await env.DB.prepare("SELECT * FROM kharj_rooms WHERE room_id=? LIMIT 1").bind(roomId).first();
 if(!row||row.ended_at||row.expires_at<=new Date().toISOString())return null;
 if(!constantTimeEqual(row.token_hash,await sha256Hex(key)))return null;
 let state={};try{state=JSON.parse(row.state_json||"{}")}catch{return null}
 return {...row,state};
}
async function saveKharjState(env,room,state){
 const next=JSON.stringify(state);
 const result=await env.DB.prepare("UPDATE kharj_rooms SET state_json=? WHERE room_id=? AND state_json=? AND ended_at IS NULL").bind(next,room.room_id,room.state_json).run();
 if(Number(result.meta?.changes||0)>0){room.state=state;room.state_json=next;return true}
 return false;
}
async function getKharjHostState(request,env,url){
 const user=await getSessionUser(request,env);
 if(!user)return json({error:"Please sign in again."},401);
 await ensureKharjSchema(env);
 const row=await env.DB.prepare("SELECT * FROM kharj_rooms WHERE room_id=? AND host_user_id=? LIMIT 1").bind(String(url.searchParams.get("roomId")||""),user.id).first();
 if(!row||row.ended_at||row.expires_at<=new Date().toISOString())return json({error:"Game session not found or expired."},404);
 let state={};try{state=JSON.parse(row.state_json||"{}")}catch{return json({error:"Game state is unreadable."},500)}
 const publicState={
  stage:state.stage,round:state.round||0,players:(state.players||[]).map(p=>({id:p.id,name:p.name})),
  categories:(state.categories||[]).map(kharjCategory).filter(Boolean).map(c=>({id:c.id,nameEn:c.en,nameAr:c.ar})),
  revealIndex:state.revealIndex||0,askRound:state.askRound||0,specialPick:state.specialPick===true,askerName:(state.players||[]).find(p=>p.id===state.askerId)?.name||"",askTargetName:(state.players||[]).find(p=>p.id===state.askTargetId)?.name||"",voteIndex:state.voteIndex||0,voteCount:Object.keys(state.votes||{}).length,
  outcome:state.stage==="results"?{winner:state.outcome?.winner,wordEn:state.secret?.wordEn,wordAr:state.secret?.wordAr,category:state.secret?.categoryId,outsiderName:state.players.find(p=>p.id===state.outsiderId)?.name||"",voteSummary:state.voteSummary||[]}:null
 };
 return json({state:publicState});
}
function kharjControllerPublicState(s,lang){
 const player=s.players?.[s.revealIndex]||null;
 let reveal=null;
 if(s.stage==="revealing"&&s.revealed===true&&player&&s.secret){
  const outsider=player.id===s.outsiderId,category=kharjCategory(s.secret.categoryId);
  reveal={
   role:outsider?"outsider":"player",
   categoryId:s.secret.categoryId,
   category:category?.[lang]||s.secret.categoryId,
   word:outsider?null:(lang==="ar"?(s.secret.wordAr||s.secret.wordEn):(s.secret.wordEn||s.secret.wordAr))
  };
 }
 const asker=s.stage==="discussion"?(s.players||[]).find(p=>p.id===s.askerId)||null:null;
 const askTarget=s.stage==="discussion"&&s.askTargetId?(s.players||[]).find(p=>p.id===s.askTargetId)||null:null;
 const askCandidates=s.stage==="discussion"&&(s.askRound||0)>=6&&!s.askTargetId?(s.players||[]).filter(p=>p.id!==s.askerId):[];
 const voter=s.players?.[s.voteIndex]||null;
 return {
  stage:s.stage,round:s.round||0,language:lang,
  players:(s.players||[]).map(p=>({id:p.id,name:p.name})),
  categories:(s.categories||[]).map(kharjCategory).filter(Boolean).map(c=>({id:c.id,name:lang==="ar"?c.ar:c.en})),
  revealIndex:s.revealIndex||0,currentPlayer:s.stage==="revealing"&&player?{id:player.id,name:player.name}:null,
  revealed:s.revealed===true,reveal,
  askRound:s.askRound||1,specialPick:s.specialPick===true,
  asker:asker?{id:asker.id,name:asker.name}:null,
  askTarget:askTarget?{id:askTarget.id,name:askTarget.name}:null,
  askCandidates:askCandidates.map(p=>({id:p.id,name:p.name})),
  voter:s.stage==="voting"&&voter?{id:voter.id,name:voter.name}:null,
  candidates:s.stage==="voting"&&voter?(s.players||[]).filter(p=>p.id!==voter.id).map(p=>({id:p.id,name:p.name})):[],
  voteIndex:s.voteIndex||0,voteCount:Object.keys(s.votes||{}).length,
  outsiderName:s.stage==="final-guess"?(s.players.find(p=>p.id===s.outsiderId)?.name||""):"",
  result:s.stage==="results"?{
   winner:s.outcome?.winner,word:lang==="ar"?(s.secret?.wordAr||s.secret?.wordEn):s.secret?.wordEn,
   category:kharjCategory(s.secret?.categoryId)?.[lang]||"",
   outsiderName:s.players.find(p=>p.id===s.outsiderId)?.name||"",
   voteSummary:s.voteSummary||[],guess:s.guess||""
  }:null
 };
}
async function getKharjControllerState(request,env,url){
 const room=await kharjRoomByKey({roomId:url.searchParams.get("roomId"),key:url.searchParams.get("key")},env);
 if(!room)return json({error:"This Kharj Al Jalsa QR is invalid or expired."},404);
 const lang=url.searchParams.get("lang")==="ar"?"ar":"en";
 return json({state:kharjControllerPublicState(room.state,lang)});
}
async function kharjControllerAction(request,env){
 const body=await readBody(request),room=await kharjRoomByKey(body,env);
 if(!room)return json({error:"This game session has expired."},404);
 const state=room.state;
 if(body.action==="configure"){
  if(state.stage!=="setup")return json({error:"You can only change players and categories before the round starts."},409);
  const rawNames=Array.isArray(body.names)?body.names:[];
  const names=rawNames.map(value=>String(value||"").trim()).filter(Boolean);
  if(names.length<3)return json({error:"Add at least 3 players."},400);
  if(names.length>24)return json({error:"This game supports up to 24 players."},400);
  if(names.some(n=>n.length<2||n.length>32))return json({error:"Each player name must contain 2 to 32 characters."},400);
  if(new Set(names.map(n=>n.toLocaleLowerCase())).size!==names.length)return json({error:"Player names must be unique."},409);
  const categories=Array.isArray(body.categories)?[...new Set(body.categories.map(String))].filter(id=>!!kharjCategory(id)):[];
  if(categories.length!==1)return json({error:"Choose exactly one category."},400);
  state.players=names.map(name=>({id:toBase64Url(randomBytes(12)),name}));
  state.categories=categories;state.language=body.language==="ar"?"ar":"en";state.stage="setup-ready";
 }else if(body.action==="start"){
  if(!["setup-ready","results"].includes(state.stage))return json({error:"Finish setup before starting a round."},409);
  if((state.players||[]).length<3||(state.categories||[]).length!==1)return json({error:"Add at least 3 players and choose exactly one category first."},400);
  try{await kharjStartRound(state,env)}catch(error){return json({error:error.message},400)}
 }else if(body.action==="reveal"){
  if(state.stage!=="revealing"||state.revealed)return json({error:"This card is not ready to reveal."},409);
  state.revealed=true;
 }else if(body.action==="next-player"){
  if(state.stage!=="revealing"||!state.revealed)return json({error:"Reveal the current card before passing the phone."},409);
  state.revealIndex++;state.revealed=false;
  if(state.revealIndex>=state.players.length)kharjBeginDiscussion(state);
 }else if(body.action==="choose-target"){
  if(state.stage!=="discussion"||(state.askRound||0)<6||state.askTargetId)return json({error:"Player selection is available on every question after the first five rounds."},409);
  const targetId=String(body.targetId||"");
  if(!state.askerId||!state.players.some(p=>p.id===targetId&&p.id!==state.askerId))return json({error:"Choose another player to question."},400);
  state.askTargetId=targetId;state.lastQuestion={askerId:state.askerId,targetId};
 }else if(body.action==="next-asker"){
  if(state.stage!=="discussion"||!state.askTargetId)return json({error:"Choose someone to question before continuing."},409);
  kharjNextAsker(state);
 }else if(body.action==="start-vote"){
  if(state.stage!=="discussion")return json({error:"The discussion phase is not open."},409);
  if((state.askRound||0)<5)return json({error:"Complete five question rounds before voting."},409);
  state.stage="voting";state.voteIndex=0;state.votes={};
 }else if(body.action==="vote"){
  if(state.stage!=="voting")return json({error:"Voting is not open."},409);
  const voter=state.players[state.voteIndex],targetId=String(body.targetId||"");
  if(!voter||!state.players.some(p=>p.id===targetId&&p.id!==voter.id))return json({error:"Choose another player."},400);
  state.votes[voter.id]=targetId;state.voteIndex++;
  if(state.voteIndex>=state.players.length){
   const counts={};Object.values(state.votes).forEach(id=>counts[id]=(counts[id]||0)+1);
   const ranked=Object.entries(counts).sort((a,b)=>b[1]-a[1]),top=ranked[0]?.[1]||0,winners=ranked.filter(x=>x[1]===top).map(x=>x[0]);
   state.voteSummary=state.players.map(p=>({name:p.name,votes:counts[p.id]||0}));
   state.caughtPlayerId=winners.length===1?winners[0]:null;
   if(state.caughtPlayerId===state.outsiderId){state.stage="final-guess"}
   else {state.stage="results";state.outcome={winner:"outsider"}}
  }
 }else if(body.action==="guess"){
  if(state.stage!=="final-guess")return json({error:"The final guess is not open."},409);
  const guess=String(body.guess||"").trim().slice(0,100);
  if(!guess)return json({error:"Enter your guess."},400);
  state.guess=guess;
  const normalized=kharjNormalizeGuess(guess);
  const correct=[state.secret?.wordEn,state.secret?.wordAr].some(word=>kharjNormalizeGuess(word)===normalized);
  state.outcome={winner:correct?"outsider":"group",guessCorrect:correct};state.stage="results";
 }else if(body.action==="play-again"){
  if(state.stage!=="results")return json({error:"Finish the current round first."},409);
  try{await kharjStartRound(state,env)}catch(error){return json({error:error.message},400)}
 }else if(body.action==="end"){state.stage="ended"}
 else return json({error:"Unknown Kharj Al Jalsa action."},400);
 if(!await saveKharjState(env,room,state))return json({error:"The game just updated. Please try again."},409);
 const responseLanguage=body.lang==="ar"?"ar":(state.language==="ar"?"ar":"en");
 return json({ok:true,state:kharjControllerPublicState(state,responseLanguage)});
}

/* JALSA Mafia: private-role, QR multiplayer game */
async function ensureMafiaSchema(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS mafia_rooms (room_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, host_user_id TEXT NOT NULL, state_json TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, ended_at TEXT)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_mafia_rooms_host ON mafia_rooms(host_user_id, created_at)").run();
}
function mafiaShuffle(items) {
  const a=[...items];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
function mafiaSetStage(state,stage,durationMs=0) {
  const now=Date.now();
  state.stage=stage;
  state.stageSeq=(state.stageSeq||0)+1;
  state.stageStartedAt=now;
  state.stageEndsAt=durationMs>0?now+durationMs:null;
  const voiceStages=["nightIntro","mafiaOpen","mafiaClose","doctorOpen","doctorClose","investigatorOpen","investigatorClose","nightResult","discussion","voteResult"];
  if(state.gameStarted===true&&voiceStages.includes(stage)){
    state.narrationEvents=Array.isArray(state.narrationEvents)?state.narrationEvents:[];
    state.narrationEvents.push({
      round:state.round||1,stageSeq:state.stageSeq,stage,
      language:state.language==="ar"?"ar":"en",
      nightOutcome:state.nightOutcome||null,
      voteOutcome:state.voteOutcome||null
    });
    if(state.narrationEvents.length>120)state.narrationEvents=state.narrationEvents.slice(-120);
  }
}
async function mafiaRoomByKey(body,env) {
  const roomId=String(body.roomId||""),key=String(body.key||"");
  if(!/^[A-Za-z0-9_-]{20,40}$/.test(roomId)||key.length<40||key.length>60)return null;
  await ensureMafiaSchema(env);
  const row=await env.DB.prepare("SELECT * FROM mafia_rooms WHERE room_id=? LIMIT 1").bind(roomId).first();
  if(!row||row.ended_at||row.expires_at<=new Date().toISOString()||!constantTimeEqual(row.token_hash,await sha256Hex(key)))return null;
  let state={};try{state=JSON.parse(row.state_json||"{}")}catch{return null;}
  return {...row,state};
}
async function saveMafiaState(env,room,state) {
  const next=JSON.stringify(state);
  const result=await env.DB.prepare("UPDATE mafia_rooms SET state_json=? WHERE room_id=? AND state_json=? AND ended_at IS NULL")
    .bind(next,room.room_id,room.state_json).run();
  if(Number(result.meta?.changes||0)>0){room.state=state;room.state_json=next;return true;}
  return false;
}
function mafiaAlivePlayers(state){return state.players.filter(p=>p.alive!==false)}
function mafiaAliveRole(state,role) {
  const id=Object.keys(state.roles||{}).find(playerId=>state.roles[playerId]===role);
  return !!id&&state.players.some(p=>p.id===id&&p.alive!==false);
}
function mafiaWinner(state) {
  const alive=mafiaAlivePlayers(state);
  const mafiaCount=alive.filter(p=>state.roles[p.id]==="mafia").length;
  const townCount=alive.length-mafiaCount;
  if(mafiaCount===0)return "town";
  if(mafiaCount>=townCount)return "mafia";
  return null;
}
function mafiaStartNextRound(state) {
  state.night={killId:null,savedId:null,investigation:null};
  state.nightOutcome=null;
  state.voteOutcome=null;
  state.votes={};
  state.winner=null;
  state.round=(state.round||1)+1;
  mafiaSetStage(state,"nightIntro",9000);
}
function mafiaEnterNightResult(state) {
  const killedId=state.night?.killId||null;
  const savedId=state.night?.savedId||null;
  const victim=state.players.find(p=>p.id===killedId);
  const saved=!!victim&&savedId===killedId;
  if(victim&&!saved)victim.alive=false;
  state.nightOutcome={
    eliminatedId:victim&&!saved?victim.id:null,
    eliminatedName:victim&&!saved?victim.name:"",
    saved,
    nobodyTargeted:!victim
  };
  state.winner=mafiaWinner(state);
  mafiaSetStage(state,"nightResult",4800);
}
function mafiaResolveVote(state,timedOut=false) {
  const alive=mafiaAlivePlayers(state);
  const votes=state.votes||{};
  if(timedOut&&Object.keys(votes).length<alive.length) {
    state.voteOutcome={eliminatedId:null,eliminatedName:"",counts:{},timedOut:true,skipped:true};
  } else {
    const counts={};
    Object.values(votes).forEach(id=>counts[id]=(counts[id]||0)+1);
    const ranked=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
    const top=ranked[0]?.[1]||0;
    const winners=ranked.filter(x=>x[1]===top);
    let eliminatedId=null;
    if(winners.length===1&&winners[0][0]!=="skip"&&top>0)eliminatedId=winners[0][0];
    const person=state.players.find(p=>p.id===eliminatedId);
    if(person)person.alive=false;
    state.voteOutcome={
      eliminatedId:person?.id||null,
      eliminatedName:person?.name||"",
      counts,
      timedOut:false,
      skipped:!person
    };
  }
  state.winner=mafiaWinner(state);
  mafiaSetStage(state,"voteResult",4200);
}
async function advanceMafiaClock(env,room) {
  const state=room.state,now=Date.now();
  let changed=false;
  const due=state.stageEndsAt&&now>=state.stageEndsAt;
  if(state.stage==="hide"&&due){mafiaSetStage(state,"roles",0);state.ready=[];changed=true;}
  else if(state.stage==="nightIntro"&&due){mafiaSetStage(state,"mafiaOpen",mafiaAliveRole(state,"mafia")?0:1600);changed=true;}
  else if(state.stage==="mafiaClose"&&due){mafiaSetStage(state,"doctorOpen",mafiaAliveRole(state,"doctor")?0:1600);changed=true;}
  else if(state.stage==="doctorOpen"&&!mafiaAliveRole(state,"doctor")&&due){mafiaSetStage(state,"doctorClose",9000);changed=true;}
  else if(state.stage==="doctorClose"&&due){mafiaSetStage(state,"investigatorOpen",mafiaAliveRole(state,"investigator")?0:1600);changed=true;}
  else if(state.stage==="investigatorOpen"&&!mafiaAliveRole(state,"investigator")&&due){mafiaSetStage(state,"investigatorClose",9000);changed=true;}
  else if(state.stage==="investigatorClose"&&due){mafiaEnterNightResult(state);changed=true;}
  else if(state.stage==="nightResult"&&due){
    if(state.winner){mafiaSetStage(state,"finished",0);}
    else {mafiaSetStage(state,"discussion",0);state.discussionEndsAt=now+600000;}
    changed=true;
  }
  else if(state.stage==="discussion"&&state.discussionEndsAt&&now>=state.discussionEndsAt){
    mafiaResolveVote(state,true);changed=true;
  }
  else if(state.stage==="voteResult"&&due){
    if(state.winner)mafiaSetStage(state,"finished",0);
    else mafiaStartNextRound(state);
    changed=true;
  }
  if(changed)await saveMafiaState(env,room,state);
  return room;
}
async function createMafiaRoom(request,env) {
  const user=await getSessionUser(request,env);
  if(!user)return json({error:"Please sign in to host Mafia."},401);
  await ensureMafiaSchema(env);
  const body=await readBody(request);
  const language=body.language==="ar"?"ar":"en";
  const roomId=toBase64Url(randomBytes(18)),key=toBase64Url(randomBytes(32));
  const now=new Date(),expires=new Date(now.getTime()+3*60*60*1000).toISOString();
  const state={stage:"lobby",stageSeq:0,round:1,language,gameStarted:false,narrationEvents:[],players:[],roles:{},ready:[],votes:{},night:{killId:null,savedId:null,investigation:null},nightOutcome:null,voteOutcome:null,winner:null};
  await env.DB.prepare("INSERT INTO mafia_rooms (room_id,token_hash,host_user_id,state_json,created_at,expires_at) VALUES (?,?,?,?,?,?)")
    .bind(roomId,await sha256Hex(key),user.id,JSON.stringify(state),now.toISOString(),expires).run();
  return json({roomId,key,expiresAt:expires});
}
async function joinMafiaRoom(request,env) {
  const body=await readBody(request),room=await mafiaRoomByKey(body,env);
  if(!room)return json({error:"This Mafia QR code is invalid or expired."},404);
  const name=cleanText(body.name,32);
  if(name.length<2)return json({error:"Enter a name with at least 2 characters."},400);
  if(room.state.stage!=="lobby")return json({error:"This Mafia game has already started."},409);
  if(room.state.players.some(p=>p.name.toLowerCase()===name.toLowerCase()))return json({error:"That name is already taken. Choose another."},409);
  if(room.state.players.length>=24)return json({error:"This game is full (24 players maximum)."},409);
  const playerId=toBase64Url(randomBytes(18));
  room.state.players.push({id:playerId,name,alive:true});
  if(!await saveMafiaState(env,room,room.state))return json({error:"Another player just joined. Please try again."},409);
  return json({ok:true,playerId,name});
}
function mafiaHostPublicState(state) {
  const now=Date.now();
  return {
    stage:state.stage,stageSeq:state.stageSeq||0,stageEndsAt:state.stageEndsAt||null,round:state.round||1,
    language:state.language==="ar"?"ar":"en",
    players:state.players.map(p=>({id:p.id,name:p.name,alive:p.alive!==false})),
    readyCount:(state.ready||[]).length,
    aliveCount:mafiaAlivePlayers(state).length,
    discussionRemainingMs:state.stage==="discussion"?Math.max(0,(state.discussionEndsAt||now)-now):0,
    nightOutcome:state.nightOutcome||null,
    voteOutcome:state.voteOutcome||null,
    winner:state.winner||null
  };
}
async function getMafiaHostState(request,env,url) {
  const user=await getSessionUser(request,env);
  if(!user)return json({error:"Please sign in again."},401);
  const roomId=String(url.searchParams.get("roomId")||"");
  await ensureMafiaSchema(env);
  const row=await env.DB.prepare("SELECT * FROM mafia_rooms WHERE room_id=? AND host_user_id=? LIMIT 1").bind(roomId,user.id).first();
  if(!row||row.ended_at||row.expires_at<=new Date().toISOString())return json({error:"Mafia game session not found or expired."},404);
  let state={};try{state=JSON.parse(row.state_json||"{}")}catch{return json({error:"Mafia game state is unreadable."},500);}
  const room={...row,state};
  await advanceMafiaClock(env,room);
  return json({state:mafiaHostPublicState(room.state)});
}
async function getMafiaPlayerState(request,env,url) {
  const room=await mafiaRoomByKey({roomId:url.searchParams.get("roomId"),key:url.searchParams.get("key")},env);
  if(!room)return json({error:"This Mafia game session has expired."},404);
  await advanceMafiaClock(env,room);
  const playerId=String(url.searchParams.get("playerId")||"");
  const player=room.state.players.find(p=>p.id===playerId);
  if(!player)return json({error:"Player not found. Scan the QR code again."},404);
  const state=room.state,role=state.roles?.[playerId]||null;
  const alive=mafiaAlivePlayers(state);
  const isInvestigator=role==="investigator";
  const investigation=isInvestigator?state.night?.investigation:null;
  const canAct=player.alive!==false&&(
    (state.stage==="mafiaOpen"&&role==="mafia")||
    (state.stage==="doctorOpen"&&role==="doctor")||
    (state.stage==="investigatorOpen"&&role==="investigator")
  );
  return json({state:{
    stage:state.stage,stageSeq:state.stageSeq||0,stageEndsAt:state.stageEndsAt||null,round:state.round||1,
    language:state.language==="ar"?"ar":"en",
    gameStarted:state.gameStarted===true,
    narrationEvents:Array.isArray(state.narrationEvents)?state.narrationEvents:[],
    player:{id:player.id,name:player.name,alive:player.alive!==false},
    role,
    ready:(state.ready||[]).includes(playerId),
    readyCount:(state.ready||[]).length,
    players:state.players.map(p=>({id:p.id,name:p.name,alive:p.alive!==false})),
    gameStarted:state.gameStarted===true,
    targets:alive.filter(p=>(state.stage==="doctorOpen"&&role==="doctor")||p.id!==playerId).map(p=>({id:p.id,name:p.name})),
    canAct,
    investigationResult:isInvestigator&&investigation&&investigation.playerId===playerId?{targetName:investigation.targetName,result:investigation.result}:null,
    nightOutcome:state.nightOutcome||null,
    voteOutcome:state.voteOutcome||null,
    discussionRemainingMs:state.stage==="discussion"?Math.max(0,(state.discussionEndsAt||Date.now())-Date.now()):0,
    hasVoted:Object.prototype.hasOwnProperty.call(state.votes||{},playerId),
    voteCount:Object.keys(state.votes||{}).length,
    aliveCount:alive.length,
    winner:state.winner||null,
    revealedRoles:state.stage==="finished"?state.roles:null
  }});
}
async function mafiaHostAction(request,env) {
  const user=await getSessionUser(request,env);
  if(!user)return json({error:"Please sign in again."},401);
  const body=await readBody(request);
  const row=await env.DB.prepare("SELECT * FROM mafia_rooms WHERE room_id=? AND host_user_id=? LIMIT 1").bind(String(body.roomId||""),user.id).first();
  if(!row||row.ended_at)return json({error:"Mafia game session not found."},404);
  let state={};try{state=JSON.parse(row.state_json||"{}")}catch{return json({error:"Mafia game state is unreadable."},500);}
  const room={...row,state};
  await advanceMafiaClock(env,room);
  if(body.action==="setLanguage"){
    if(room.state.stage!=="lobby")return json({error:"The game language is locked after the game starts."},409);
    room.state.language=body.language==="ar"?"ar":"en";
  }else if(body.action==="start"){
    if(room.state.stage!=="lobby"||room.state.players.length<4)return json({error:"At least 4 players are required to start Mafia."},400);
    const shuffled=mafiaShuffle(room.state.players);
    const roles={};
    roles[shuffled[0].id]="mafia";
    roles[shuffled[1].id]="doctor";
    roles[shuffled[2].id]="investigator";
    shuffled.slice(3).forEach(p=>roles[p.id]="citizen");
    room.state.roles=roles;room.state.ready=[];room.state.round=1;
    room.state.gameStarted=true;room.state.narrationEvents=[];
    room.state.night={killId:null,savedId:null,investigation:null};
    mafiaSetStage(room.state,"hide",4000);
  }else if(body.action==="end"){
    mafiaSetStage(room.state,"ended",0);
  }else return json({error:"Unknown Mafia host action."},400);
  const next=JSON.stringify(room.state);
  const result=await env.DB.prepare("UPDATE mafia_rooms SET state_json=?,ended_at=NULL WHERE room_id=? AND state_json=? AND ended_at IS NULL")
    .bind(next,row.room_id,room.state_json).run();
  if(!Number(result.meta?.changes||0))return json({error:"The game just updated. Please try again."},409);
  return json({ok:true});
}
async function mafiaPlayerAction(request,env) {
  const body=await readBody(request),room=await mafiaRoomByKey(body,env);
  if(!room)return json({error:"This Mafia game session has expired."},404);
  await advanceMafiaClock(env,room);
  const state=room.state,playerId=String(body.playerId||"");
  const player=state.players.find(p=>p.id===playerId);
  if(!player)return json({error:"Player not found."},404);
  if(player.alive===false)return json({error:"Eliminated players cannot take actions."},403);
  const action=String(body.action||"");
  if(action==="ready"){
    if(state.stage!=="roles")return json({error:"The role reveal is not active."},409);
    state.ready=Array.isArray(state.ready)?state.ready:[];
    if(!state.ready.includes(playerId))state.ready.push(playerId);
    if(state.ready.length===state.players.length){state.night={killId:null,savedId:null,investigation:null};mafiaSetStage(state,"nightIntro",9000);}
  }else if(action==="kill"){
    if(state.stage!=="mafiaOpen"||state.roles[playerId]!=="mafia")return json({error:"Only the living Mafia player can choose the target."},403);
    const targetId=String(body.targetId||"");
    if(targetId===playerId||!mafiaAlivePlayers(state).some(p=>p.id===targetId))return json({error:"Choose a different living player."},400);
    state.night=state.night||{};state.night.killId=targetId;
    mafiaSetStage(state,"mafiaClose",9000);
  }else if(action==="save"){
    if(state.stage!=="doctorOpen"||state.roles[playerId]!=="doctor")return json({error:"Only the living Doctor can choose whom to save."},403);
    const targetId=String(body.targetId||"");
    if(!mafiaAlivePlayers(state).some(p=>p.id===targetId))return json({error:"Choose a living player. You can save yourself."},400);
    state.night=state.night||{};state.night.savedId=targetId;
    mafiaSetStage(state,"doctorClose",9000);
  }else if(action==="investigate"){
    if(state.stage!=="investigatorOpen"||state.roles[playerId]!=="investigator")return json({error:"Only the living Investigator can investigate."},403);
    const targetId=String(body.targetId||"");
    const target=mafiaAlivePlayers(state).find(p=>p.id===targetId&&p.id!==playerId);
    if(!target)return json({error:"Choose another living player."},400);
    state.night=state.night||{};
    state.night.investigation={playerId,targetName:target.name,result:state.roles[targetId]==="mafia"?"mafia":"citizen"};
    mafiaSetStage(state,"investigatorClose",9000);
  }else if(action==="vote"){
    if(state.stage!=="discussion")return json({error:"Voting is not open."},409);
    if(!mafiaAlivePlayers(state).some(p=>p.id===playerId))return json({error:"Only living players can vote."},403);
    const targetId=String(body.targetId||"");
    if(targetId!=="skip"&&!mafiaAlivePlayers(state).some(p=>p.id===targetId&&p.id!==playerId))return json({error:"Choose another living player or skip."},400);
    state.votes=state.votes||{};state.votes[playerId]=targetId;
    if(Object.keys(state.votes).length===mafiaAlivePlayers(state).length)mafiaResolveVote(state,false);
  }else return json({error:"Unknown Mafia player action."},400);
  if(!await saveMafiaState(env,room,state))return json({error:"The game just updated. Please try again."},409);
  return json({ok:true});
}
