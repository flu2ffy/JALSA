# JALSA

JALSA is a bilingual Arabic/English collection of multiplayer party games with a modern Arabic-majlis identity.

## Development branch

The current V1.6 account work is being prepared on `v1.6-auth-fix`. Do not merge this branch into `main` until the owner has reviewed the preview and approved release.

## V1.6 account features

- Password-based registration and sign-in.
- Email verification before an account can play.
- Six-digit verification codes that expire after 10 minutes and are stored as HMAC hashes.
- Forgot-password flow with a separate six-digit reset code.
- PBKDF2-SHA-256 password hashes; passwords are never stored in plaintext.
- HttpOnly, Secure, SameSite=Lax session cookies.
- Login attempt throttling and one-hour code-request limits.
- Admin-only registered-user list, using the configured `ADMIN_EMAIL`.
- Bilingual English/Arabic account screens and bilingual branded JALSA email templates.

Existing accounts created by the earlier email-code-only version are retained. Because those accounts do not have a password hash, their owners should use **Forgot password** to set a password before logging in with the new version.

## Cloudflare configuration

The Worker is configured in `wrangler.jsonc` and uses the D1 database named `jalsa-auth`.

Required Worker secrets (set in Cloudflare, never commit their values):
- `RESEND_API_KEY`
- `VERIFICATION_SECRET` (use a long random value)

Configured non-secret variables:
- `MAIL_FROM`: `JALSA <Accountservice@jalsa.me>`
- `REPLY_TO`: `support@jalsa.me`
- `ADMIN_EMAIL`: `1mr.cute3@gmail.com`

The email templates load the JALSA logo from `https://jalsa.me/jalsa-logo.png`. The sender address must remain verified in Resend.

## Database migration

The original V1.6 database schema is updated by `migrations/0002_password_auth.sql`. This migration adds the nullable `password_hash` column, rebuilds the verification-code table to allow password-reset codes while preserving old registration and sign-in codes, and creates the login-attempt throttle table.

Before deploying the new Worker, inspect the migration target:
```sh
npx wrangler d1 migrations list jalsa-auth --remote
```

Then apply the migration to the intended D1 database:
```sh
npx wrangler d1 migrations apply jalsa-auth --remote
```

**Check the database ID in `wrangler.jsonc` before running the command.** The configured production D1 ID is `f147c99a-9be7-4ce4-88e2-8e465420e3ce`. The preview D1 ID is different, so only use Wrangler's `--preview` option after confirming that the preview database is the one you intend to update. Do not run the production migration merely to test a preview.

For a brand-new database, `schema.sql` describes the complete current schema; do not apply both the baseline schema and the migration to the same empty database.

## Release checklist

1. Apply the migration to the chosen test database.
2. Confirm both Worker secrets are configured for that environment.
3. Test registration, email verification, password login, forgot password, reset password, logout, and the admin users list.
4. Check the English and Arabic layouts and play both existing games while signed in.
5. Review the branch preview.
6. Merge into `main` and deploy only after explicit approval.

Production deployment is intentionally not performed as part of development edits.
