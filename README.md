# JALSA

JALSA is a bilingual Arabic/English collection of multiplayer party games with a modern Arabic-majlis identity.

## Development branch

The V1.6 account update is being prepared on `v1.6-auth-fix`. The production branch `main` has not been changed or deployed by this work.

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

The Worker is configured in `wrangler.jsonc` and uses the production D1 database named `jalsa-auth`. The V1.6 branch Preview is explicitly bound to `jalsa-auth-preview`.

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

**Preview migration status:** Applied to `jalsa-auth-preview` from the Cloudflare D1 Console and recorded in `d1_migrations` as `0002_password_auth.sql`. The `password_hash` column and migration record were verified in the Preview database. Production has not been migrated.

A dedicated config, `wrangler.preview-migrations.jsonc`, targets only `jalsa-auth-preview`. Do not run the migration against Production. For future migration changes, inspect the Preview target carefully before applying.

For a brand-new database, `schema.sql` describes the complete current schema; do not apply both that baseline schema and the migration to the same empty database.

## Preview and release checklist

1. Confirm the Cloudflare Preview deployment uses the Preview Base secrets and `jalsa-auth-preview` D1 binding.
2. Test registration, email verification, password login, forgot password, reset password, logout, and the admin users list.
3. Check English and Arabic layouts, then play both existing games while signed in.
4. Review the Preview. Merge into `main` and deploy only after explicit approval.

Production deployment and production database migration are intentionally not part of these development edits.
