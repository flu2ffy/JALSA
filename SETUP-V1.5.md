# JALSA V1.5 — setup before publishing

V1.5 adds email-code accounts, a protected administrator user list, Arabic question text, the new hero/category images, and the Zanko rule updates.

**Do not merge V1.5 until the D1 database ID and the Cloudflare secrets below are configured.** The placeholders in `wrangler.jsonc` must be replaced first or the Worker deployment will fail.

## 1. Create the D1 database

1. Open the Cloudflare dashboard.
2. Go to **Workers & Pages → D1 SQL Database** (the label may appear under Storage & Databases).
3. Create a database named `jalsa-auth`.
4. Copy the database ID shown in its details.
5. Open `wrangler.jsonc` and replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` with that exact ID.
6. Open the D1 database's **Console** and paste the full contents of `schema.sql`, then run it.

The database stores display name, email, verification status, hashed one-time codes, and hashed session tokens. It does not store passwords.

## 2. Configure the JALSA verification email sender

V1.5 uses Resend to send verification codes through the JALSA domain. The configured sender is `verify@mail.jalsa.me`; replies go to `support@jalsa.me`.

1. Create a Resend account at https://resend.com.
2. Add the sending domain **`mail.jalsa.me`** in Resend.
3. Resend will show the DNS records it requires (typically DKIM and SPF-related records). Add the exact records it provides to the `jalsa.me` zone in Cloudflare DNS.
4. Wait until Resend marks `mail.jalsa.me` as verified.

**Important:** `mail.jalsa.me` is a sending subdomain. Do not delete or replace your existing Microsoft 365 MX records or your root-domain Microsoft 365 mail records. Add only the records Resend asks for under the `mail` subdomain.

Resend's current free plan lists 3,000 emails per month and a 100-email daily limit. Check its pricing page before relying on those limits: https://resend.com/pricing.

## 3. Add Worker variables and secrets

Open **Workers & Pages → jalsa → Settings → Variables and Secrets**.

Add these as **Secrets** (not plain text variables):

- `RESEND_API_KEY` — create an API key in your Resend dashboard.
- `VERIFICATION_SECRET` — a long, random secret (at least 32 random characters). Generate it privately and do not commit it to GitHub or send it in chat.

The following values are configured in `wrangler.jsonc` under `vars`:

- `MAIL_FROM`: `JALSA <verify@mail.jalsa.me>`
- `REPLY_TO`: `support@jalsa.me`
- `ADMIN_EMAIL`: replace `REPLACE_WITH_YOUR_ADMIN_EMAIL` with the exact email address that should be allowed to view registrations.

Keep `ADMIN_EMAIL` consistent between the file and Cloudflare settings if you choose to override the value in the dashboard.

## 4. How registration and sign-in work

- Register: enter a display name and email address, then enter the six-digit code sent to that email.
- Log in: enter the registered email and enter the new six-digit code sent to it.
- Codes expire after 10 minutes, allow up to five attempts, and are rate-limited.
- Sessions use a Secure, HttpOnly, SameSite cookie and expire after 30 days.
- The site checks the session before opening Zanko or Price Guessing.

This is passwordless email-code sign-in. Users do not create or store passwords.

## 5. How to see registered users

Log in using the exact `ADMIN_EMAIL` configured above. The homepage header will show an **Admin** button. Open it to see names, email addresses, verification status, and registration dates. The API checks the administrator email on the server; ordinary accounts cannot access the list.

## 6. GitHub deployment

1. Create a new branch named `v1.5` from `main`.
2. Upload the contents of this package, preserving the folder structure:
   - Replace the files inside `public/` with the files inside this package's `public/` folder.
   - Add `worker.js`, `schema.sql`, `wrangler.jsonc`, and `SETUP-V1.5.md` at the repository root.
3. Before merging, confirm the D1 ID and `ADMIN_EMAIL` placeholders in `wrangler.jsonc` have been replaced and the two Cloudflare secrets exist.
4. Create a pull request from `v1.5` into `main`.
5. Check the pull request files, then merge. Cloudflare should deploy the updated Worker and static assets.
6. Wait for Cloudflare's deployment to say **Ready**, then test registration, email verification, login, admin access, and game entry on `https://jalsa.me`.

Do not upload secret API keys or the verification secret into GitHub.
