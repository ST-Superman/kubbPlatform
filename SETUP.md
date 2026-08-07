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

## Project map

```
src/
  app/
    layout.tsx           # fonts (Fraunces/Inter/JetBrains Mono), theme, header
    page.tsx             # landing
    login/page.tsx       # sign in
    signup/page.tsx      # sign up
    dashboard/page.tsx   # protected route
    error/page.tsx       # auth error fallback
    auth/
      actions.ts         # login / signup / signout server actions
      confirm/route.ts   # email link → verifyOtp → session
  components/
    site-header.tsx      # auth-aware nav
    auth-form.tsx        # shared sign in / up form
    theme-provider.tsx / theme-toggle.tsx
    ui/                  # shadcn components
  lib/supabase/
    client.ts            # browser client
    server.ts            # server-component / action client
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
