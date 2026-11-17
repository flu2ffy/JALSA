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
