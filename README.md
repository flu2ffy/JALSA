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

The Worker is configured in `wrangler.jsonc` and uses the D1 database named `jalsa-auth`.

Required Worker secrets (set in Cloudflare, never commit their values):
- `RESEND_API_KEY`
- `VERIFICATION_SECRET` (use a long random value)

Configured non-secret variables:
- `MAIL_FROM`: `JALSA <Accountservice@jalsa.me>`
- `REPLY_TO`: `support@jalsa.me`
- `ADMIN_EMAIL`: `1mr.cute3@gmail.com`

The email templates load the JALSA logo from `https://jalsa.me/jalsa-logo.png`. Keep the sender domain verified in Resend.

## Database migration

The existing V1.6 database is updated by `migrations/0002_password_auth.sql`. It adds the nullable `password_hash` column, rebuilds the verification-code table to allow password-reset codes while preserving old registration and sign-in codes, and creates the login-attempt throttle table.

**Do not run a remote migration command until the target database ID has been checked.** The production database ID in this config is `f147c99a-9be7-4ce4-88e2-8e465420e3ce`. The Preview binding points to a different ID, `5a867196-333c-416c-94c2-a0833f69728a`.

For a Preview migration, Cloudflare's recommended workflow is a separate Wrangler config that points at the exact same Preview database ID as `previews.d1_databases`. The Preview database's exact Cloudflare database name still needs to be confirmed before creating that migration config. Do not point a Preview migration at the production database.

Only after the production release has been approved should the production migration be inspected and applied:
```sh
npx wrangler d1 migrations list jalsa-auth --remote
npx wrangler d1 migrations apply jalsa-auth --remote
```

For a brand-new database, `schema.sql` describes the complete current schema; do not apply both that baseline schema and the migration to the same empty database.

## Release checklist

1. Confirm the Preview D1 database and its name, then apply the migration to that Preview database only.
2. Confirm `RESEND_API_KEY` and `VERIFICATION_SECRET` are configured for the Preview environment.
3. Test registration, email verification, password login, forgot password, reset password, logout, and the admin users list.
4. Check English and Arabic layouts, then play both existing games while signed in.
5. Review the Preview.
6. Merge into `main` and deploy only after explicit approval.

Production deployment is intentionally not part of these development edits.
