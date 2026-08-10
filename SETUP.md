# Kubb Platform — Phase 0 Setup

The web platform for competitive kubb. **Phase 0 (Foundations) is complete** ✅ —
verified locally and in production. It includes: Next.js + TypeScript + Tailwind
v4 + shadcn/ui, the Supabase SSR auth wiring, an app shell on the Kubb Coach
design tokens (light/dark), and a full email sign-up / sign-in / sign-out flow
with a protected `/dashboard` route.

The code is done — these steps connect it to your own Supabase project and Vercel.
None of them require touching the code. If you're setting this up fresh, read the
**Troubleshooting** section (§5) first — it lists the exact snags we hit.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind v4 + shadcn/ui, kubb design tokens |
| Backend / Auth | Supabase (cloud project, RLS-first) |
| Auth client | `@supabase/ssr` (browser + server + middleware) |
| Hosting | Vercel |

## 1. Create the Supabase project (W1)

1. Sign in at https://supabase.com → **New project**. Pick a name, a strong DB
   password (save it), and the region closest to you. Free tier is fine.
2. Wait for it to provision (~2 min).
3. **Project Settings → API**. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / publishable** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (The anon key is safe in the browser — Row Level Security protects the data.)

## 2. Configure email auth

1. **Authentication → Providers → Email**: ensure it's enabled.
2. For fast local testing you can **turn off "Confirm email"** (Authentication →
   Sign In / Providers → Email). With it on, signup sends a link that lands on
   `/auth/confirm` (already implemented).
3. **Authentication → URL Configuration**: set **Site URL** to
   `http://localhost:3000` for now, and add it under **Redirect URLs**.
   Add your Vercel URL here too once you deploy.

## 3. Run locally (W1–W3)

```bash
cp .env.example .env.local          # then paste your URL + anon key
npm install                          # already done if you're picking up mid-stream
npm run dev                          # http://localhost:3000
```

Verify the Phase 0 acceptance checks:
- [x] Home page renders in the kubb design system; theme toggle switches light/dark.
- [x] **Sign up** with an email + password (≥6 chars). With confirmation on,
      click the emailed link; it should land you signed-in on `/dashboard`.
- [x] `/dashboard` shows your email + user id — proof the **auth session reached a
      Server Component** and `auth.uid()` is available to RLS.
- [x] Visiting `/dashboard` while signed out redirects to `/login` (middleware gate).
- [x] **Sign out** returns you to home as a guest.

## 4. Deploy to Vercel (W1)

1. Push this repo to GitHub (see below).
2. https://vercel.com → **Add New → Project** → import the repo. Framework
   auto-detects as Next.js.
3. Add the two env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   in the Vercel project settings. **Use the base Project URL** (see §5.1) — not the
   `/rest/v1` one.
4. Deploy. If you later change an env var, **redeploy** — Vercel does not rebuild
   automatically on env changes (Deployments → ⋯ → Redeploy).
5. **Deployment Protection:** new Vercel projects gate the whole site behind "Vercel
   Authentication," so every route 302-redirects to Vercel SSO and only you can see
   it. To make production public: **Project → Settings → Deployment Protection** →
   turn off Vercel Authentication (or set it to protect *Preview only*).
6. (Only if you re-enable email confirmation) add the deployed `https://…vercel.app`
   URL to Supabase **Site URL / Redirect URLs**.

## 5. Troubleshooting (snags we actually hit)

### 5.1 "Invalid path specified in request URL" on signup

`NEXT_PUBLIC_SUPABASE_URL` must be the **base Project URL**
(`https://<ref>.supabase.co`) — *not* the Data API / RESTful endpoint
(`…/rest/v1`) and no trailing slash. The client appends its own paths, so an extra
path produces `…/rest/v1/auth/v1/signup` → this error. The app now normalizes the
URL to its origin (`src/lib/supabase/env.ts`), but set it correctly anyway.

### 5.2 No confirmation email / the old link stopped working

- Confirmation links **expire and are single-use** — an old one will stop working.
- Supabase's **built-in email service is heavily rate-limited** (a few/hour, for
  testing only), so re-registering an existing unconfirmed address often sends
  nothing.
- **For the spike, turn email confirmation OFF** (Authentication → Sign In /
  Providers → Email → uncheck "Confirm email"). Then delete any stuck unconfirmed
  user (Authentication → Users) and re-register — you'll be signed in instantly, no
  email involved. Wire real SMTP (Resend/Postmark) later when confirmation matters.

### 5.3 Env changes don't take effect

`.env.local` is read **only at server startup** — restart `npm run dev` after
editing it. On Vercel, changing an env var requires a **redeploy**.

## 6. Sign in with Apple (Phase 1 W6)

The app code is done — an "Continue with Apple" button on `/login` + `/signup` and
the `/auth/callback` route that exchanges the OAuth code for a session. Until you
complete the config below, clicking it shows "Apple sign-in isn't configured yet."

### 6.1 Apple Developer portal (developer.apple.com → Certificates, Identifiers & Profiles)

Create four artifacts:

1. **App ID** — an Identifier with **Sign in with Apple** capability enabled. Leave the
   server-to-server notification endpoint blank (Supabase doesn't use it). You can reuse
   the existing Kubb Coach App ID as the primary.
2. **Services ID** — a separate Identifier (e.g. `coach.kubb.web`). This is your web
   **Client ID**. Enable Sign in with Apple on it and configure **Website URLs**:
   - **Domain:** `wynockzaeikgkntosqek.supabase.co`
   - **Return URL:** `https://wynockzaeikgkntosqek.supabase.co/auth/v1/callback`
3. **Sign in with Apple Key** — a Key with Sign in with Apple enabled; download the
   `AuthKey_XXXXXXXXXX.p8` (one-time download) and note the **Key ID**.
4. **Team ID** — the 10-char ID in the top-right of the Apple Developer console.

### 6.2 Supabase → Authentication → Providers → Apple

- Enable the provider.
- **Client IDs:** your Services ID (e.g. `coach.kubb.web`).
- **Secret Key:** generate it from the `.p8` + Team ID + Key ID + Services ID using the
  generator linked right there in the Supabase Apple docs (keys never leave your browser).
  ⚠️ Apple secrets expire — **regenerate every 6 months**.

### 6.3 Supabase → Authentication → URL Configuration

Add both app origins to **Redirect URLs** so Supabase can bounce back to `/auth/callback`:
`http://localhost:3000/**` and your `https://…vercel.app/**`. (Apple only sees the
Supabase callback URL from §6.1 — localhost testing still works because Supabase, not
Apple, does the final redirect to your app.)

### 6.4 Test

`/login` → **Continue with Apple** → Apple consent → back to `/dashboard`, signed in.
The `handle_new_user` trigger creates the profile just like an email signup.

## 7. Production hardening (Phase 3)

Before sharing widely. Code is already in place; these are Supabase dashboard steps.

### 7.1 RLS — match data scoped to participants
Migration `supabase/migrations/*_tighten_match_rls.sql` replaces the open
`SELECT using (true)` policies on `matches`/`games`/`turns`/`match_participants`/
`match_lineups` with creator/participant scope (via SECURITY DEFINER `can_view_match`
helpers). The app is unaffected — it reads match data only through SECURITY DEFINER
RPCs — but the auto REST API no longer leaks other people's matches. Apply with
`supabase db push`. (`profiles`/`players`/`teams` stay public: profiles + rosters are
meant to be readable.)

### 7.2 Email confirmation + SMTP

**Current stance (small invited group):** the spike runs with **Confirm email OFF**. That's fine
while it's a handful of people you invite personally — RLS (§7.1) is what protects data; email
verification mainly matters at scale. If you want light verification now, you *can* enable Confirm
email on Supabase's **built-in mailer** (no SMTP setup) — it's rate-limited to a few emails/hour,
acceptable for a tiny group. **Custom SMTP below is deferred until a domain is secured.**

The app code already supports the confirmed-email flow either way: `auth/actions.ts signup` returns
a "check your email" message when signup yields no session, and `auth/confirm/route.ts` verifies the
`token_hash` and binds the session cookie to the redirect.

#### When ready for real email — Resend + Supabase (recommended)

Resend has a free tier (~3,000/mo, 100/day), a simple dashboard, and pairs cleanly with this stack.
(Postmark = great deliverability but paid-first; SES = cheapest at scale but fiddly AWS setup.)

1. **Domain (prerequisite for good deliverability).** Sending from your own address
   (`noreply@yourdomain`) requires verifying a domain. No domain yet → Resend's test sender
   `onboarding@resend.dev` works immediately for trying it, but get a domain before real use
   (unverified/shared senders land in spam).
2. **Resend account.** Sign up at resend.com → **Domains → Add domain** → paste the DNS records it
   shows (SPF/DKIM `TXT` + `MX`) into your registrar's DNS; wait for "Verified".
3. **API key.** Resend → **API Keys → Create** → copy it (shown once).
4. **Supabase SMTP.** Project Settings → **Authentication → SMTP Settings** → enable custom SMTP:
   - Host: `smtp.resend.com`  ·  Port: `465` (or `587`)
   - Username: `resend`  ·  Password: *your Resend API key*
   - Sender email: an address on your verified domain (e.g. `noreply@yourdomain`)  ·  Sender name: `Kubb Platform`
5. **Turn on confirmation.** Auth → Providers → Email → enable **Confirm email**.
6. **URL Configuration.** Site URL = your production origin; Redirect allowlist = prod origin
   **and** `http://localhost:3000` (covers `/auth/callback` + `/auth/confirm`). Re-check the Apple
   redirect too (§6.3).
7. **Confirm-signup email template.** Point the link at the SSR route (token_hash flow, not the
   implicit-fragment default):
   ```text
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard
   ```
8. **Test.** Sign up a fresh email → confirmation arrives (check the Resend dashboard's log if not)
   → link lands you signed in on `/dashboard`; an unconfirmed account can't sign in.

### 7.3 Deferred
Private realtime broadcast topic (comes with spectate links), rate limiting, abuse controls.

## Project map

```
supabase/
  migrations/0001_identity.sql  # profiles/players/teams + trigger + RLS + backfill
src/
  app/
    layout.tsx           # fonts (Fraunces/Inter/JetBrains Mono), theme, header
    page.tsx             # landing
    login/page.tsx       # sign in (Apple + email)
    signup/page.tsx      # sign up (Apple + email)
    dashboard/page.tsx   # protected; shows handle/display name
    profile/page.tsx     # protected; view + edit profile
    profile/actions.ts   # updateProfile server action
    error/page.tsx       # auth error fallback
    auth/
      actions.ts         # login / signup / signout server actions
      confirm/route.ts   # email link → verifyOtp → session
      callback/route.ts  # OAuth (Apple) code → exchangeCodeForSession
  components/
    site-header.tsx      # auth-aware nav
    auth-form.tsx        # shared sign in / up form
    oauth-buttons.tsx    # "Continue with Apple"
    profile-form.tsx     # profile edit form
    theme-provider.tsx / theme-toggle.tsx
    ui/                  # shadcn components
  lib/supabase/
    client.ts            # browser client
    server.ts            # server-component / action client
    env.ts               # URL/key normalizer
    profiles.ts          # getMyProfile() + Profile type
    middleware.ts        # session refresh + route guard (helper)
  proxy.ts               # Next proxy convention (guard entry point)
```

## What's next

- **Phase 1** — `profiles` table + signup trigger, editable profile, Sign in with
  Apple, and claimable/managed players (`schema.sql` profiles/players section +
  `Claim Flow.dc.html`).
- **Phase 2** — `matches`/`games`/`turns` schema, `submit_turn`/`rewind_to`
  Postgres functions, Realtime, two-tab match harness (`Match Loop Prototype.dc.html`).

Design references, `schema.sql`, and `functions.sql` live in the Kubb Coach repo
under `design_handoff_kubb_platform_spike/`.
