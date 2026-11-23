# JALSA

V1.7 account and admin dashboard work is in progress on the separate v1.7-account-admin branch. It remains isolated from production until reviewed and approved.

JALSA is a bilingual Arabic/English collection of multiplayer party games with a modern Arabic-majlis identity.

## Development branch

V1.7 is being prepared on `v1.7-account-admin` and the draft pull request targets `main`. The production branch `main` remains on V1.6 until explicit release approval.

## V1.6 account features

- Password-based registration and sign-in.
- Email verification before an account can play.
- Six-digit verification codes that expire after 10 minutes and are stored as HMAC hashes.
- Forgot-password flow with a separate six-digit reset code.
- PBKDF2-SHA-256 password hashes; passwords are never stored in plaintext.
- HttpOnly, Secure, SameSite=Lax session cookies.
- Login attempt throttling and per-purpose email-code request limits.
- Admin-only registered-user list, using the configured `ADMIN_EMAIL`.
- Bilingual English/Arabic account screens and branded bilingual JALSA emails.

Existing accounts created by the earlier email-code-only version are retained. Verified existing users can use **Forgot password** to set a password. An older unverified account can repeat registration with the same email and provide a password.

## Cloudflare configuration

The Worker is configured in `wrangler.jsonc` and uses the production D1 database named `jalsa-auth`. Worker Previews are explicitly bound to `jalsa-auth-preview` and separate Preview resources.

The Preview Base environment has these two secrets configured in the Cloudflare dashboard (never commit their values):
- `RESEND_API_KEY`
- `VERIFICATION_SECRET`

Production and Preview each have their own secrets. Preview deployments use Preview Base values and do not inherit Production secrets.

Configured non-secret variables:
- `MAIL_FROM`: `JALSA <Accountservice@jalsa.me>`
- `REPLY_TO`: `support@jalsa.me`
- `ADMIN_EMAIL`: `1mr.cute3@gmail.com`

The email templates load the JALSA logo from `https://jalsa.me/jalsa-logo.png`. Keep the sender domain verified in Resend.

## Preview D1 migration

The production database is `jalsa-auth` (ID `f147c99a-9be7-4ce4-88e2-8e465420e3ce`). The isolated Preview database is `jalsa-auth-preview` (ID `5a867196-333c-416c-94c2-a0833f69728a`).

The migration `migrations/0002_password_auth.sql` adds the nullable `password_hash` column, rebuilds the verification-code table to allow password-reset codes while preserving existing registration and login-code records, and creates the login-attempt throttle table.

**Migration status:** Applied to both `jalsa-auth-preview` and Production `jalsa-auth` from the Cloudflare D1 Console. In both databases, the `password_hash` column and `0002_password_auth.sql` record were verified in `d1_migrations`. Production's migration was taken after creating a Cloudflare D1 recovery bookmark.

A dedicated config, `wrangler.preview-migrations.jsonc`, targets only `jalsa-auth-preview`. Do not run the migration against Production. For future migration changes, inspect the Preview target carefully before applying.

For a brand-new database, `schema.sql` describes the complete current schema; do not apply both that baseline schema and the migration to the same empty database.

## Preview and release checklist

1. The Preview and Production D1 migrations are applied and verified.
2. Preview and Production Runtime secrets are configured in Cloudflare; never commit their values.
3. Test registration, email verification, password login, forgot password, reset password, logout, and the admin users list.
4. Check English and Arabic layouts, then play both existing games while signed in.
5. Review the Preview. Merge into `main` and deploy only after explicit approval.

Production deployment and production database migration are intentionally not part of these development edits.


## V1.7 account and admin dashboard (development)
- The account name opens a left-side drawer with Profile, Send feedback, and (for the configured administrator) Dashboard; logout is at the bottom.
- Profile supports display-name edits, birth date, and a resized profile picture.
- Feedback messages are stored in the admin dashboard inbox.
- Admin user management shows verification and last-login timestamps and supports ban, unban, and deletion. The configured administrator account is protected from ban/deletion.
- Zanko editor manages bilingual categories and questions, difficulty levels, and direct local image, video, and audio uploads.
- Price Guessing editor manages product names, JOD prices, difficulty, and optional media links.
- Question media uses publicly accessible HTTPS image/video/audio URLs; direct binary uploads are not enabled in this first V1.7 iteration.
- Migration 0003_v17_dashboard.sql adds profile, feedback, account moderation, category, and question tables. Apply to Preview first and verify before Production.


## V1.7 preview-only features in progress

- Admin user details editor: view account metadata, update display name, birth date and profile image, set a new password, and verify/unverify email. Email addresses are read-only.
- Randomized Zanko selection: categories and questions are shuffled for each new game; duplicate prompts are filtered within a session.
- Price Guessing is being rebuilt as an empty, USD-only product bank. Products need a real uploaded image or media asset; the old JOD/emoji products are removed by migration 0004.
- Admin editors accept local image, video, and audio uploads. Files are stored in Cloudflare R2, not embedded as data URLs or saved as external links.
- Production and Preview use different R2 buckets. The Preview bucket is `jalsa-media-preview`; the Production bucket is `jalsa-media`. The Worker binding name in code is `MEDIA`.
- Supported uploads: JPG, PNG, WebP, GIF (up to 20 MB); MP4, WebM, MOV (up to 35 MB); MP3, M4A, AAC, OGG, WAV (up to 25 MB).

### V1.7 Preview setup

1. Create the R2 bucket `jalsa-media-preview` in Cloudflare before testing local uploads in a Worker Preview.
2. The `previews.r2_buckets` entry in `wrangler.jsonc` binds Preview runtime to that bucket; Production uses `jalsa-media`.
3. Apply `migrations/0004_price_usd_media_storage.sql` to `jalsa-auth-preview` only. It removes all legacy Price Guessing products and records the migration.
4. Do not apply migration 0004 to Production until V1.7 has been reviewed and explicitly approved for release.
5. Production's R2 bucket `jalsa-media` must exist before the approved Production release is deployed.

Preview bindings are separate from Production bindings; check the Wrangler `previews` block when changing resource bindings. Uploads are private in R2 and are served through the Worker media route.


## Imposter game (Preview)
- The Imposter game uses a host QR lobby, private player phone pages, four randomized ask assignments, an all-player Ready gate, and private voting.
- Administrators manage the word bank in Dashboard → Imposter words. The Preview migration seeds starter words across Fruit, Restaurant, Cars, Electronics, Places, and Animals.
- For Preview, apply migrations `0005_remote_rooms.sql` and `0006_imposter_game.sql` to **jalsa-auth-preview only**. Apply them to Production only as part of the approved V1.8 release.
- The game stores room state in the Preview D1 database and expires rooms after three hours.

## Paddle billing: Preview and Production

Preview and Production must use separate Paddle credentials. The Preview configuration remains on **Sandbox**. The live site uses the **Production** environment on the Cloudflare Worker named `jalsa`.

In Cloudflare → Workers & Pages → `jalsa` → Settings → Variables and Secrets, add these **Production variables** using values copied from the Paddle Live dashboard:

- `PADDLE_ENVIRONMENT`: `production` (also configured in the top-level Wrangler vars)
- `PADDLE_PRICE_ID`: the live monthly Price ID (`pri_...`)
- `PADDLE_CLIENT_TOKEN`: the live Paddle.js client-side token

Add these as **Production secrets**, not committed values:

- `PADDLE_API_KEY`: Paddle Live API key
- `PADDLE_WEBHOOK_SECRET`: the signing secret generated for the live webhook destination

Create a live Paddle webhook destination pointing to `https://jalsa.me/api/paddle/webhook`. Subscribe it to the subscription lifecycle events consumed by the Worker: `subscription.created`, `subscription.updated`, `subscription.activated`, `subscription.trialing`, `subscription.past_due`, `subscription.paused`, `subscription.resumed`, and `subscription.canceled`. Copy that destination's signing secret into `PADDLE_WEBHOOK_SECRET`.

Keep the Preview values and Preview secrets on Sandbox; do not copy Sandbox keys, tokens, Price IDs, or webhook secrets into Production. The admin Dashboard → Subscriptions panel should show payment configuration as complete only when all four Paddle values are present. A completed checkout is not enough by itself: verify that the live webhook updates a test customer's JALSA subscription status and premium badge.

Before the live release, test checkout and cancellation with a separate account on the live site, then confirm the webhook event and subscription status in Paddle and JALSA. Never commit API keys or webhook signing secrets to this repository.
