# Kubb Portal — Chat / Messaging Feature: Design Spec

**Status:** Design/spec only — not yet built. Ready to sequence into phases.

## Context

Kubb Portal currently has no way for users to communicate. The goal is user-to-user messaging: 1:1 DMs, group chats, in-match chat, and platform-wide announcements — with a privacy setting to limit or disable messages. This spec chooses an architecture that reuses what the platform already has (Supabase Realtime Broadcast, the challenge→email pipeline, `notification_prefs`, RLS + `SECURITY DEFINER` RPC conventions) and calls out the two gaps that must be built from scratch: an eligibility/block model and moderation.

**Locked decisions:**

1. **"Message all users" = admin announcements only** — a read-only, one-to-many broadcast. There is no peer-to-peer "message everyone." Users can mute *promotional* announcements, not *critical* ones.
2. **DM eligibility = people you've played or challenged** — reuses `match_participants` + `challenges` as a kubb-native allow-list. No arbitrary stranger DMs; no friends/accept graph to build.
3. **Build approach = Supabase-native, Broadcast-from-Database** — same pattern as the match engine. No third-party SDK, no per-user SaaS cost, data stays in Postgres.
4. **Block + Report are Phase 1**, not deferred — DMs without them are irresponsible given there's no moderation tooling today.

## Architecture at a glance

- **Transport:** a `messages` `AFTER INSERT` trigger calls `realtime.send(payload, 'message', 'conv:<id>', false)`; clients subscribe with `supabase.channel("conv:<id>").on("broadcast", { event: "message" }, ...)`. This mirrors `broadcast_match_state()` in `supabase/migrations/20260809160045_realtime_and_harness.sql` and the client pattern in `src/components/match-client.tsx`.
- **Data access:** RLS-locked tables; every write goes through a `SECURITY DEFINER` RPC that re-checks `auth.uid()` — the same convention as `submit_turn`, `create_challenge`, etc. Thin wrapper in `src/lib/supabase/messages.ts`.
- **Unified conversation model** covers DM / group / match chat as one code path; **announcements are separate** (to avoid a per-user membership row for the whole user base).
- **Migrations are applied manually** by pasting into the Supabase SQL editor — this repo does *not* auto-apply migrations (see existing migration file headers).
- **Multi-client:** the same backend serves the Next.js web app **and** the Kubb Coach iOS app. Because every RPC is `SECURITY DEFINER` keyed on `auth.uid()`, both clients call the *same* functions authenticated as the same platform user — no client-specific server code (except APNs push). See the **iOS client** section.

## Data model

New tables (follow existing column/UUID/`created_at` conventions from `supabase/setup_identity.sql` and the match engine migration). All keyed on `players.id` (the identity entity used by matches/challenges), **not** `profiles`.

```
conversations
  id          uuid pk default gen_random_uuid()
  type        text check (type in ('dm','group','match'))
  match_id    uuid null references matches(id) on delete cascade   -- set when type='match'
  title       text null                                            -- group name
  created_by  uuid references auth.users(id)
  created_at  timestamptz default now()

conversation_members
  conversation_id uuid references conversations(id) on delete cascade
  player_id       uuid references players(id) on delete cascade
  role            text default 'member' check (role in ('member','owner'))
  last_read_at    timestamptz null            -- drives unread counts
  muted           boolean default false
  joined_at       timestamptz default now()
  primary key (conversation_id, player_id)

messages
  id              uuid pk default gen_random_uuid()   -- client-generated ok (idempotent), like turns
  conversation_id uuid references conversations(id) on delete cascade
  sender_player_id uuid references players(id)
  body            text not null check (char_length(body) between 1 and 4000)
  created_at      timestamptz default now()
  deleted_at      timestamptz null                    -- soft delete (self or moderation)

player_blocks
  blocker_player_id uuid references players(id) on delete cascade
  blocked_player_id uuid references players(id) on delete cascade
  created_at        timestamptz default now()
  primary key (blocker_player_id, blocked_player_id)

message_reports
  id          uuid pk default gen_random_uuid()
  message_id  uuid references messages(id) on delete set null
  reporter_player_id uuid references players(id)
  reason      text
  status      text default 'open' check (status in ('open','reviewed','actioned','dismissed'))
  created_at  timestamptz default now()

announcements                       -- "all users" = admins post, everyone reads
  id           uuid pk default gen_random_uuid()
  title        text not null
  body         text not null
  severity     text default 'promo' check (severity in ('promo','critical'))
  published_at timestamptz null      -- null = draft
  created_by   uuid references auth.users(id)
  created_at   timestamptz default now()
-- announcement_reads(announcement_id, user_id, read_at) optional for per-user dismiss
```

**RLS pattern (mirror `can_view_match` / `tighten_match_rls`):**

- `conversations` / `messages` SELECT via a `SECURITY DEFINER` helper `is_conversation_member(p_conversation_id)` that checks the caller's `players.user_id = auth.uid()` is in `conversation_members`.
- Messages from a blocked sender are filtered in the read RPC (or a `SELECT` policy join against `player_blocks`).
- `player_blocks`, `message_reports` — own-row read; **no client write policy** (RPC-only), same as `notification_prefs` / `match_tokens`.
- `announcements` — public SELECT of rows where `published_at is not null`; write is service_role/admin-only.

## RPCs (the write/read surface)

All `SECURITY DEFINER`, `search_path = public`, re-checking `auth.uid()`:

- `can_dm(p_target_player uuid) returns boolean` — true if caller and target share a `match_participants` match **or** any `challenges` row (either direction), **and** neither has blocked the other, **and** target's `dm_policy` allows. This is the eligibility gate.
- `start_or_get_dm(p_target_player uuid) returns uuid` — enforces `can_dm`, returns existing DM conversation or creates one with both members.
- `send_message(p_conversation_id uuid, p_body text, p_client_id uuid) returns uuid` — checks membership, not-blocked, (optional) `is_entitled`, inserts message. `p_client_id` gives idempotent resend (like `submit_turn`).
- `list_my_conversations()` — inbox: conversations + last message + unread count (from `last_read_at`).
- `conversation_messages(p_conversation_id, p_before timestamptz, p_limit int)` — paginated thread read.
- `mark_read(p_conversation_id uuid)` — sets `last_read_at = now()`.
- `create_group(p_title text, p_member_player_ids uuid[])` — Phase 2; each invitee must be `can_dm`-eligible or accept.
- `block_player(p_player uuid)` / `unblock_player(p_player uuid)`.
- `report_message(p_message_id uuid, p_reason text)` — inserts a report; fires an admin email via the existing Resend path.
- Privacy: extend `notification_prefs` (see below) with `my_message_prefs()` / `set_message_prefs(...)` mirroring `my_notification_prefs` / `set_challenge_emails`.
- Announcements: `publish_announcement(...)` (admin/service_role), `list_announcements()` (public, published only).

## Realtime

- **Per-conversation topic** `conv:<conversation_id>`, event `message`. `AFTER INSERT` trigger on `messages` calls `realtime.send(jsonb_build_object(...), 'message', 'conv:'||NEW.conversation_id, false)`. Client subscribes when a thread is open (same lifecycle as `match-client`'s channel).
- **Unread badge without opening every thread:** broadcast a lightweight `inbox` event to a per-user topic `player:<player_id>` on new message, so the inbox/nav badge updates live. (Optional in Phase 1; can fall back to `router.refresh()` like `matches-realtime.tsx`.)
- **In-match chat** uses its own `conv:<id>` topic (keep separate from the existing `match:<id>` state topic).

## Notifications (email)

Reuse the challenge pipeline wholesale — `supabase/migrations/20260909120000_notification_prefs_and_challenge_email.sql` + `supabase/functions/notify-challenge/index.ts`:

- Message-notification email should be **offline-only / debounced**, not one email per message (per-message email is spam). Recommended v1: email a recipient at most once per conversation per N minutes when they have unread and appear inactive.
- Extend `notification_prefs`, don't add a new table:
  - `dm_emails boolean default true`
  - `dm_policy text default 'eligible' check (dm_policy in ('eligible','none'))` — `eligible` = anyone you've played/challenged; `none` = DMs off.
  - `allow_group_add boolean default true`
  - `announcement_promo boolean default true` — can mute promo announcements; `critical` always delivered.
- Keep the RFC-8058 one-click unsubscribe path in `src/app/api/unsubscribe/route.ts`.

## UI surfaces

- **Inbox** — new route `src/app/messages/page.tsx` + `src/components/conversation-list.tsx` (unread badges). Nav entry near profile.
- **Thread** — `src/app/messages/[id]/page.tsx` + `src/components/message-thread.tsx` (subscribe to `conv:<id>`, optimistic send via `sonner` toasts on failure, block/report affordances per message).
- **In-match panel** — a chat tab or `Sheet` in `src/components/match-client.tsx` (three-column desktop layout ~L399; `Sheet` is already imported). Members = match participants; spectator access is an open decision.
- **Privacy/message settings** — extend `src/app/settings/notifications/page.tsx` + `src/components/notification-settings.tsx` with a Messaging section (the four prefs above).
- **Announcements** — a dismissible banner on `src/app/dashboard/page.tsx` + a `src/app/announcements/page.tsx` list.
- **Admin** — Phase 3: a minimal `src/app/admin/reports` console (there is no admin UI today; Phase 1 reports just email the admin).
- **Wrapper** — `src/lib/supabase/messages.ts` (types + RPC wrappers), matching `src/lib/supabase/matches.ts`.

## Membership gating (recommendation)

Chat should be **free during Beta** (the paywall triggers in `supabase/migrations/20260903144559_paywall_enforcement.sql` are currently inert anyway). Leave a hook: `send_message` can call `is_entitled(auth.uid())` if you later decide DMs are a paid feature. Do **not** gate reading announcements or in-match chat.

## iOS client (Kubb Coach) — surfacing messages

The Kubb Coach native app (SwiftUI/SwiftData/CloudKit) reuses this same Supabase backend. The messaging RPCs are `SECURITY DEFINER` keyed on `auth.uid()`, so the iOS client calls the *same functions* as the same platform user — one backend, two clients, no iOS-specific server work except push.

**Substrate already in place — no new auth or networking to build:**

- `supabase-swift` v2.51.0 is already a dependency; `Realtime` is already used (account-vs-account matches subscribe today).
- The kubb-platform login lives in `Kubb Coach/Kubb Coach/Utilities/PlatformSupabaseConfig.swift` (`client`); auth is handled by `Services/KubbPlatformService.swift` (ASWebAuthenticationSession token hand-off → `client.auth.setSession`, Keychain-persisted, auto-refresh). Identity = `PlatformSupabaseConfig.client.auth.currentUser?.id`.
- All messaging UI gates on `KubbPlatformService.shared.isConnected` — the same gate as Virtual Matches (`VirtualMatchesGateView`). Not connected → show the "Connect your Kubb Platform account" prompt, not an empty inbox.

**v1 scope (locked): read + reply + in-match chat + announcements + block/report.** Starting brand-new DMs and creating groups are deferred (web-first); alerts are in-app only (no APNs) in v1.

**Build:**

- **`Services/MessagingService.swift`** — clone `Services/VirtualMatchService.swift`: `@MainActor @Observable` singleton on `PlatformSupabaseConfig.client`; calls `list_my_conversations` / `conversation_messages` / `send_message` / `mark_read` / `block_player` / `report_message` / `list_announcements`; subscribes to the `conv:<id>` Realtime broadcast for the open thread; exposes `unreadCount` (mirror `VirtualMatchService.attentionCount`). Inject in `Kubb_CoachApp.swift` beside the other platform services.
- **Inbox → thread** — a `MessagesRootView` owning one `NavigationStack(path:)` with a `MessageRoute` enum (`.thread(conversationId:)`), mirroring `Views/VirtualMatches/VirtualMatchesRootView.swift`. Thread composer is a `.safeAreaInset(edge:.bottom)` bar like `MatchPlayView.stickyActionBar`. Style with `Color.Kubb` (teal `matchAccent` pillar), `KubbType`, `KubbModifiers`.
- **Entry point** — a notification **bell in the Lodge header toolbar beside the gear** (`Views/Home/HomeView.swift`) **plus a Lodge banner card cloned from `virtualMatchesBanner`**, both showing `unreadCount` via the existing `TabBarButton` badge idiom. No 4th tab.
- **In-match chat** — attach to `Views/VirtualMatches/MatchPlayView.swift` (already Realtime-subscribed for account matches) as a sheet from the header or a segment above the sticky action bar; conversation = the match's `conv:<id>`.
- **Announcements** — a dismissible banner on the Lodge + a simple list, read via `list_announcements`; respect `announcement_promo` mute (`critical` always shown).
- **Settings** — a `MessagingSettingsView` in `Views/Settings/` using `SettingsPrimitives` (`SettingsToggle` / `SettingsNavRow`), added to `SettingsView`'s app list; model notification-permission handling on `EmailReportSettingsView.swift`. Writes the same `notification_prefs` fields (`dm_policy`, `dm_emails`, `allow_group_add`, `announcement_promo`) via `set_message_prefs`.
- **Deep link** — add `messages` to `Utilities/DeepLinkRouter.swift` `validHosts` and route `kubbcoach://messages/{conversationId}` in `MainTabView`'s handler (scheme + `.onOpenURL` already wired).

**Alerts (v1): in-app only** — Realtime for live thread updates + the unread badge; a **local** notification (existing `NotificationService` pattern) may fire while the app is foregrounded. **No APNs remote push in v1.**

**Deferred to a dedicated push phase (net-new, spans both repos):** `registerForRemoteNotifications` on iOS + device-token delegate; a `device_tokens` table on kubb-platform keyed to `auth.users`; an APNs sender (Edge Function/trigger parallel to the Resend email path) firing on new message and honoring `notification_prefs`; tap-through via `kubbcoach://messages/{id}`. `aps-environment=production` is already entitled, so no provisioning change.

## Phasing

Two tracks. The iOS track depends on the backend/web **W1** RPC surface being live.

**Backend + web track**

- **W1 — DMs + in-match chat + safety:** schema + RLS + RPCs + broadcast trigger; 1:1 DM inbox/thread; in-match panel; `block`/`report`; message privacy settings; offline DM email (opt-out).
- **W2 — Groups:** `create_group`, group membership management, group thread UI.
- **W3 — Announcements + moderation:** admin announcement publish + banner/list; minimal reports console.

**iOS (Kubb Coach) track**

- **i1 — Read + reply + announcements + safety:** `MessagingService`, inbox→thread, in-match chat panel, Lodge bell/banner, announcements banner+list, `MessagingSettingsView`, block/report, `messages` deep link. In-app realtime + unread badge only.
- **i2 — APNs remote push:** device-token registration + `device_tokens` table + APNs sender + tap-through deep link (the one net-new infra piece).
- **i3 (later) — compose parity:** start new DMs / create groups from iOS once W2 lands.

## Open decisions (resolve before Phase 1 build)

1. **In-match chat persistence & spectators** — save match chat to history, or ephemeral? Can spectators (via spectate tokens) post, read-only, or be excluded? (Recommend: persisted, players-only posting in v1.)
2. **DM email cadence** — per-conversation debounce vs. daily digest vs. offline-only. (Recommend: offline-only, debounced.)
3. **Typing/presence indicators** — in v1 or later? (Greenfield; recommend later — it's a clean `.channel` add-on.)
4. **Rate limiting** — cap messages/min per sender to blunt spam (Postgres check or app-level).
5. **Message editing/retention** — allow edits? retention window? (Recommend: soft-delete only, no edit, in v1.)
6. **iOS "Message" affordance before native compose (i3)** — expose a "Message" button on iOS player/opponent profiles that deep-links to the web to start a new DM, or hide it entirely until i3? (Recommend: hide until i3 to avoid a web bounce.)
7. **watchOS** — confirmed out of scope for now; revisit after the push phase (i2).

## Verification (once built)

1. Apply the new migration by **pasting it into the Supabase SQL editor** (manual — not auto-applied), then `my_message_prefs()` / `can_dm()` smoke-test in the SQL editor.
2. Two browser sessions (two accounts that have played/challenged each other): open a DM from A → B, confirm B receives it live via the `conv:<id>` broadcast (no refresh).
3. Negative eligibility: attempt a DM to an account with no shared match/challenge → `can_dm` false, RPC rejects.
4. Block: B blocks A; confirm A's send is rejected and prior messages hidden for B.
5. Report: file a report, confirm the admin email arrives via Resend.
6. Privacy: set `dm_policy='none'`, confirm inbound DMs are refused; toggle `dm_emails` off, confirm no email.
7. In-match: open the chat panel in a live match, confirm participant messages broadcast on `conv:<id>` alongside existing `match:<id>` state.
8. Announcement: publish a `critical` announcement, confirm it appears for a user who muted `promo`.
9. Run `npm test` (Vitest) for any new pure logic (e.g., unread-count / eligibility helpers).

**iOS (Kubb Coach), after i1:**

1. Connect a Kubb Platform account in-app; confirm the inbox lists conversations via `list_my_conversations`, open a thread, confirm live receipt over the `conv:<id>` Realtime channel and reply via `send_message`.
2. Cross-client: send a web → iOS message between the two accounts; confirm the Lodge bell/banner unread badge increments live and clears after `mark_read`.
3. In a live account-vs-account match, open the in-match chat panel; confirm messages flow on `conv:<id>` alongside match state.
4. Not-connected state shows the "Connect your Kubb Platform account" prompt (not an empty inbox); muting `announcement_promo` hides promo announcements but still shows `critical`.
5. Build: `xcodebuild -scheme "Kubb Coach" -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build` succeeds; existing 102 unit tests still pass.
