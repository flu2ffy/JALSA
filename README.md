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

The Worker is configured in `wrangler.jsonc` and uses the D1 database named `jalsa-auth`. The V1.6 branch Preview is explicitly bound to `jalsa-auth-preview`.

Required secrets (set in Cloudflare; never commit their values):
- `RESEND_API_KEY`
- `VERIFICATION_SECRET` (a long random value)

Production and Preview each have their own secrets. Worker Previews do not inherit production secrets. Configure the Preview Base secrets in Cloudflare or set secrets for the current Preview using Wrangler:
```sh
npx wrangler preview secret put RESEND_API_KEY --name v1.6-auth-fix
npx wrangler preview secret put VERIFICATION_SECRET --name v1.6-auth-fix
```
Enter the secret values only in the hidden terminal prompt. Never paste them into GitHub or this chat.

Configured non-secret variables:
- `MAIL_FROM`: `JALSA <Accountservice@jalsa.me>`
- `REPLY_TO`: `support@jalsa.me`
- `ADMIN_EMAIL`: `1mr.cute3@gmail.com`

The email templates load the JALSA logo from `https://jalsa.me/jalsa-logo.png`. Keep the sender domain verified in Resend.

## Preview D1 migration

The production database is `jalsa-auth` (ID `f147c99a-9be7-4ce4-88e2-8e465420e3ce`). The isolated Preview database is `jalsa-auth-preview` (ID `5a867196-333c-416c-94c2-a0833f69728a`).

The migration `migrations/0002_password_auth.sql` adds the nullable `password_hash` column, rebuilds the verification-code table to allow password-reset codes while preserving existing registration and login-code records, and creates the login-attempt throttle table.

A dedicated config, `wrangler.preview-migrations.jsonc`, targets only `jalsa-auth-preview`. From the repository root, inspect the pending Preview migration:
```sh
npx wrangler d1 migrations list PREVIEW_DB --remote --config wrangler.preview-migrations.jsonc
```

Only after the output confirms the target is `jalsa-auth-preview`, apply it:
```sh
npx wrangler d1 migrations apply PREVIEW_DB --remote --config wrangler.preview-migrations.jsonc
```
Wrangler asks for confirmation and captures a backup. Do not remove the config or change its database ID to the production ID.

For a brand-new database, `schema.sql` describes the complete current schema; do not apply both that baseline schema and the migration to the same empty database.

## Preview and release checklist

1. Apply the migration to `jalsa-auth-preview` using the dedicated Preview migration config.
2. Configure Preview secrets for `v1.6-auth-fix`.
3. Deploy a Worker Preview using Wrangler 4.135.0 or later (`npx wrangler preview`) or the connected Workers Builds Preview workflow.
4. Test registration, email verification, password login, forgot password, reset password, logout, and the admin users list.
5. Check English and Arabic layouts, then play both existing games while signed in.
6. Review the Preview. Merge into `main` and deploy only after explicit approval.

Production deployment and production database migration are intentionally not part of these development edits.
