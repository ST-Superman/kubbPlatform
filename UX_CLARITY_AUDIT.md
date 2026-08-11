# UX Clarity Audit — Kubb Platform

A walkthrough of every surface, listing what is displayed or asked. Use it to decide,
item by item, whether each element needs **helper text** (inline) or a **clickable info
button** (ⓘ that opens a short explanation).

## How to use this doc
- Every item has a **stable ID** (e.g. `LM-12`) — reference it when we discuss ("clarify DA-3, LM-12").
- **Suggested** column is my starting recommendation, not a decision:
  - 🔴 strong candidate — jargon or an ask a newcomer likely won't get
  - 🟡 minor / nice-to-have
  - ⚪ probably self-explanatory
- **Decision** column is yours to fill: `inline`, `ⓘ`, `skip`, or a note.

## Recommended approach (read first)
Much of the confusion is the **same kubb vocabulary** repeated across many surfaces
(baton, baseline/field kubb, advantage line, lag, king shot, base-kubb double…). Rather than
write N separate blurbs, consider **one shared glossary + a reusable `<InfoDot term="baton" />`**
component that shows a tooltip/popover from a single source of truth. Then most 🔴 rows below
collapse to "attach the info dot." A short list of glossary terms is at the end (`GL`).

---

## G · Global — header, nav, landing

| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| G-1 | Brand lockup `KUBB PLATFORM` | Logo → `/` | ⚪ | skip |
| G-2 | Signed-out nav = only `SIGN IN` / `SIGN UP` | No site map before login | 🟡 | skip |
| G-3 | `@{handle}` in header (signed in) | User's unique handle | 🟡 | `ⓘ` - "Unique player handle, edit in profile" |
| G-4 | Nav links `Dashboard / Matches / Players / Profile` | Primary nav | ⚪ | |
| G-5 | Landing headline + sub-copy ("Score matches live from the pitch…") | Marketing hero | 🟡 | skip |
| G-6 | "from the **pitch**" | Pitch = the playing field | 🔴 | skip |
| G-7 | Feature card: "they **claim** their side and score their own turns" | Introduces claim/invite model | 🔴 | skip - but let's change this to state "they claim their profile and score their own turns" |
| G-8 | "**both phones** / Phone-first" | Two-device scoring model | 🟡 | skip - but let's change the text to read "Live scoring, remote matches (virtual)". → RESOLVED: adopt **"virtual match"** as the term site-wide for the current product (a *virtual match* = two players competing remotely, each sending turn/round results; a future *live match* = one profile takes a "scorekeeper" role, either a spectator or a player). |
| G-9 | `kubb` itself never defined on landing | Assumes sport knowledge | 🟡 | skip |
| G-10 | Brand name inconsistency: `KUBB PLATFORM` vs `kubb.coach` (claim/watch buttons) | Naming mismatch | 🟡 | Kubb Coach is my iOS app, built to help users train for kubb, while Kubb Platform is going to be web based and focus on competitive kubb (tournaments / leagues / virtual matches / live matches).  right now we are only working on the virtual matches. → RESOLVED: relabel the 4 `kubb.coach` strings (3 on claim page, 1 on watch page) to **"Kubb Platform"**, linking to the site landing page (`/`). |

---

## AU · Auth & onboarding

| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| AU-1 | Login heading "Welcome back" / "Sign in to pick up your game." | Copy | ⚪ | skip - but let's have the copy read "Sign in to view your dashboard" --- ** this means that when they sign in, the site needs to take them to their dashboard.  This is not what currently happens. → RESOLVED: copy → "Sign in to view your dashboard"; **redirect authenticated users (all methods incl. Apple/Google OAuth) to `/dashboard`** — bounce signed-in users away from `/` and `/login`. (Bug seen: Apple login didn't land on dashboard.) |
| AU-2 | `EMAIL`, `PASSWORD` fields (min 6, shown only on failure) | Login/signup inputs | 🟡 | skip |
| AU-3 | `Forgot?` link (must type email first — only told via toast after failure) | Password reset trigger | 🔴 | skip |
| AU-4 | OAuth `Continue with Google/Apple` | Social sign-in | ⚪ | skip |
| AU-5 | Signup heading "Join the **pitch**" | Pitch jargon again | 🟡 | lets change the text to read "Welcome to the Kubb Platform!  Let's play some Kubb" |
| AU-6 | Signup collects no name/handle | Identity set later on `/profile`, not signposted | 🔴 | let's collect the information during sign up, that's a great idea. Include `ⓘ` copy that will explain how each field is used as well → RESOLVED: collect **display name + handle** at signup (avatar later), each with an ⓘ. OAuth signups → a one-time **"Finish your profile"** step (they skip the form). Claim-link signups → **"Confirm your profile"** with fields **prepopulated from the managed player and editable** before continuing. |
| AU-7 | Email-confirmation fork (some users get "check your email", others dropped in) | Inconsistent expectation | 🟡 | skip |
| AU-8 | `/error` copy assumes "confirmation link expired" | Also catches OAuth failures; no "request fresh link" action | 🟡 | Let's give the user some clear direction for how to get around the error, i.e. Request a fresh link -- this should be a CTA built within the app that will reach the player that invited the new user to send them a new link → RESOLVED: put the CTA on the **claim expired/invalid** states (where we know the player + inviter), not the generic `/error`. "Request a fresh link" creates an **in-app request** the inviter sees (e.g. on `/players`) so they can regenerate. |
| AU-9 | Reset page "Set a new password" (no context whether from email vs intentional) | Recovery + change-pw dual use | 🟡 | let's add the appropriate context |

### AU (claim flow — `/claim/[token]`, `/claim/done`)
| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| AU-10 | "CLAIM YOUR IDENTITY" / "You played kubb as {name}" | Invitee binds a pre-made player to their account | 🔴 | `ⓘ` - "Your player profile has already been created.  Confirm this is you and welcome to the Kubb Platform" |
| AU-11 | "Claim this **identity** to keep your results…" | What claiming does / is it reversible / one-per-account | 🔴 | `ⓘ` "You may have already played a game of kubb that was recorded by another user.  This will allow us to connect that game to your profile." |
| AU-12 | "Claiming binds this identity to your account" | Technical phrasing, consequences unclear | 🔴 | Can we show a table or something that would display the matches that we have for the unclaimed player?  Something like a list of the date of the match and who they played against and the outcome?  Then we could add copy "Claiming this player identity will allow us to connect this data to your Kubb Platform player profile" → RESOLVED: show the **most recent ~5** matches (date · opponent · outcome); OK to show to a **signed-out** visitor on the tokenized claim page. Needs the claim preview to return those matches. |
| AU-13 | Error "already claimed a **managed player**" | Internal term leaking; implies one-per-account never stated | 🔴 | "only one player profile can be claimed by a single account.  If this player profile is also you, please contact the administrator to help resolve the issue."  We would then need a CTA that would allow them to send a message to sathomps@gmail.com with prepopulated text stating the Profile and player identities that should be combined.  I would need to know which profiles or identities needed to be merged.  I would also want to include a free text section for the user to add any comments as well. → RESOLVED: use a **`mailto:`** to sathomps@gmail.com prefilled with both identities + a free-text section, for now. **FLAG:** migrate to a proper in-app email form once the email backend (Resend) is set up. |
| AU-14 | "ask your **match organizer** for a fresh one" | Role term | 🟡 | `ⓘ` The match organizer is the person who sent you the invite. |
| AU-15 | `/claim/done`: "everything you play from here **counts**" | Implies prior play didn't — mixed message vs "keep your results" | 🟡 | Agreed, let's change the copy to "Welcome to the Kubb Platform.  Feel free to organize your own matches, or wait for another match invite" |

---

## PR · Profile (`/profile`)

| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| PR-1 | Identity card: avatar, display name, `@handle`, "Member since" | Summary | ⚪ | |
| PR-2 | `Handle` field + helper "3–30 chars: lowercase, numbers, underscores" | Unique @-id | 🟡 | `ⓘ` |
| PR-3 | Handle vs Display name distinction | Not explained beyond placeholder | 🔴 | `ⓘ` let's explain the distinction |
| PR-4 | `Display name` placeholder "How your name shows on match cards" | Shown name | ⚪ | |
| PR-5 | `Avatar URL` (paste an external image link; "uploads come later") | Unusual ask for non-technical users | 🟡 | Can we explore getting the uploads to work now? → RESOLVED: scope **separately** as a real feature (Supabase Storage bucket + upload/crop control replacing the URL field). See best-practices below. |

---

## PL · Players (`/players`)

| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| PL-1 | Tabs `Current Players` / `New Players` | Accounts vs managed | 🟡 | `ⓘ` Players with accounts vs Invite someone new to the Kubb Platform |
| PL-2 | Current player row: `{wins}–{losses}`, `{n} played` / `no matches` | Unlabeled record | 🟡 | in line |
| PL-3 | New Players intro: "Add someone by name — no account needed… they can **claim** later" | Managed-player concept | 🔴 | `ⓘ` You will be able to record the players results for them until claim the player identity and create a Kubb platform profile. |
| PL-4 | New-player form: "Add to roster", helper "they can claim this identity later" | Create managed player | 🟡 | `ⓘ` |
| PL-5 | `UNCLAIMED` badge + "Managed by you" | Managed-player state | 🔴 | `ⓘ` |
| PL-6 | QR + claim link + "Single use · Expires in {N} days" + `Regenerate link` | Invite mechanics | 🟡 | `ⓘ` Player can scan this QR code (or click on the link) to create their own Kubb Platform profile and connect it to this player |

---

## DA · Dashboard (`/dashboard`)

| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| DA-1 | `SEASON RECORD` `{wins}–{losses}` | "Season" undefined (= all finished matches) | 🟡 | change copy to "All time record" |
| DA-2 | `WIN RATE` `{%}` | wins ÷ played | ⚪ | skip |
| DA-3 | `🔥 {n}-MATCH WIN STREAK` | Consecutive wins | ⚪ | skip |
| DA-4 | LAST-5 W/L dots — **no heading** | Five most recent decided results | 🔴 | `ⓘ` |
| DA-5 | Resume eyebrow `LAG PHASE / YOUR LAG / WAITING ON LAG` | **Lag** = opening toss, never explained | 🔴 | `ⓘ` |
| DA-6 | Resume eyebrow `YOU'RE UP / {OPP}'S TURN / IN PROGRESS` | Whose action | 🟡 | `ⓘ` |
| DA-7 | Resume `GAME {n}` + `{mine}–{theirs}` (games won) | Game count vs points | 🟡 | skip |
| DA-8 | Coach line (e.g. "New match, fresh start.") | Flavor | ⚪ | skip |
| DA-9 | `CHALLENGES` inbox — `RACE TO {n}`, Accept/Decline/Cancel | See CM-challenge | 🔴 | `ⓘ` |

---

## MA · Matches list & new match (`/matches`)

| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| MA-1 | Helper "This is **spike scaffolding to exercise the match engine**." | Dev language in UI | 🔴 | remove |
| MA-2 | Opponent picker "Search players or type a new name…" | Select or create managed | 🟡 | `ⓘ` |
| MA-3 | "Playing {name} (**managed** — you'll score both sides)" | Managed concept | 🔴 | `ⓘ` |
| MA-4 | "Playing {name} (they'll get a **challenge** to accept)" | Account = challenge flow | 🟡 | `ⓘ` |
| MA-5 | `Race to` selector `1 / 2 / 3 / 5 / 7` (skips 4, 6) | First-to-N games | 🔴 | in-line → RESOLVED: **race-to set = 1 / 2 / 3 everywhere** (drop 5/7 here); + race-to ⓘ |
| MA-6 | Button flips `Create match` ↔ `Send challenge` | Behavior differs by opponent kind | 🟡 | skip |
| MA-7 | Lists `In progress` / `Completed` with MatchRows | Grouping | ⚪ | skip |

---

## LM · Live match (`/matches/[id]`) — the densest surface

### LM — header & banners
| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| LM-1 | Header eyebrow `RACE TO {n} · LAG PHASE / GAME {n} / FINAL` | Status | 🟡 | `ⓘ` |
| LM-2 | `🏆 MATCH OVER · BY FORFEIT`, per-game chips `G{n} · {WINNER}` | Result banner | ⚪ | skip |
| LM-3 | `MATCH ABANDONED — no result recorded` | Abandoned state | ⚪ | skip |

### LM — panels (per side)
| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| LM-4 | Panel meta `SIDE A · WON LAG · ADV LINE {label}` | Side status | 🟡 | `ⓘ` |
| LM-5 | Chips `SPECTATING / LAG LOCKED / ENTER LAG / YOUR TURN / WAITING / 🏆 WINNER / DEFEATED` | State chips | 🟡 | skip |
| LM-6 | StatTile `MY BASELINE` | Own baseline kubbs standing | 🔴 | SUGGEST: ⓘ (glossary: baseline kubb) |
| LM-7 | StatTile `TO CLEAR` (orange when >0) | Own field kubbs to clear — **perspective flips vs pitch's "MUST CLEAR"** | 🔴 | SUGGEST: ⓘ (glossary: field kubb); flag — consider relabel to fix the panel-vs-pitch perspective flip → RESOLVED: **relabel panel stat `TO CLEAR` → `MUST CLEAR`** (match the pitch) + ⓘ (glossary: field kubb) |
| LM-8 | StatTile `KING SHOTS` | Count | 🟡 | SUGGEST: ⓘ (glossary: king) |
| LM-9 | StatTile `GAMES` | Games won | ⚪ | SUGGEST: skip |

### LM — lag entry
| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| LM-10 | `LAG — TOSS AT THE KING` + select | The opening toss to decide who throws first | 🔴 | SUGGEST: ⓘ (glossary: lag) |
| LM-11 | Lag options: "Touching the King", "1–24 inches…", "Not even close", "Knocked down the King" | Lag scale | 🔴 | SUGGEST: ⓘ (glossary: lag) — friendly labels already in the select |
| LM-12 | Locked state shows raw code `✓ Locked (0.1)` / `(98)` / `(99)` | Opaque sentinel values | 🔴 | SUGGEST: inline fix — show the friendly lag label, not the raw code |
| LM-13 | Mobile lag helper "Lower is better: 0.1 touching… 99 knocked the king." | Only place the scale is explained | 🟡 | SUGGEST: inline — surface this "lower is better" helper on desktop too |

### LM — the turn form (core scoring input)
| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| LM-14 | Baton counter `{used} / {cap} BATONS` (red over cap) | **Round cap** varies (2/4/6) — never explained | 🔴 | SUGGEST: ⓘ (round cap — batons allowed this round: 2 → 4 → 6 as the game opens) |
| LM-15 | Stepper `PENALTY KUBBS` — "thrown out / re-thrown" | Penalty mechanic, terse | 🔴 | SUGGEST: ⓘ (glossary: penalty kubb) |
| LM-16 | Stepper `BATONS TO CLEAR FIELD` — "{n} field kubb(s) on your side" | Field batons | 🔴 | SUGGEST: ⓘ (glossary: baton + field kubb) |
| LM-17 | Stepper `FIELD KUBBS LEFT` — "of {n} — still standing after your throws" | Easily conflated with LM-16 | 🔴 | SUGGEST: ⓘ (glossary: field kubb); keep sub-label distinct from LM-16 |
| LM-18 | `ADVANTAGE LINE GIVEN — YOU LEFT FIELD KUBBS` + select (`At the King`…`12 ft`…`At the Baseline`) | Leaving field kubbs hands opponent an advantage line | 🔴 | SUGGEST: ⓘ (glossary: advantage line given) |
| LM-19 | Toggle `BASE KUBB DOUBLE` | What a baseline double is | 🔴 | SUGGEST: ⓘ (glossary: base kubb double) |
| LM-20 | Stepper `BATONS AT BASELINE` — "from your advantage line / from the 8 meter line" | Baseline batons + throw origin | 🔴 | SUGGEST: ⓘ (glossary: 8-meter line vs advantage line) |
| LM-21 | Stepper `BASELINE KUBBS HIT` — "do NOT count the double" | Assumes you know what the double is | 🔴 | SUGGEST: ⓘ (glossary: base kubb double — why it's counted separately) |
| LM-22 | Stepper `KING SHOTS` — "attempts at the King this turn" | King attempts | 🟡 | SUGGEST: ⓘ (glossary: king) |
| LM-23 | Toggle `KING HIT — WIN` | Knocking king (legally) wins | 🟡 | SUGGEST: ⓘ (glossary: king) |
| LM-24 | Toggle `KING EARLY — FOUL` | Early king = instant loss | 🔴 | SUGGEST: ⓘ (glossary: king — hitting it early = instant loss) |
| LM-25 | Stepper controls are ± only (no numeric entry) | Interaction model | ⚪ | SUGGEST: skip |

### LM — turn log, pitch, mobile, overlays, actions
| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| LM-26 | `TURN LOG · APPEND-ONLY` | Engineering term | 🟡 | SUGGEST: inline — rename eyebrow to just "TURN LOG" (drop "APPEND-ONLY") |
| LM-27 | `↺ FIX MY LAST TURN` / `REWIND` / `VOIDED` / "voids the {n} turn(s) after it" | Rewind semantics | 🔴 | SUGGEST: ⓘ (glossary: rewind / voided) |
| LM-28 | `THE PITCH · SPECTATOR VIEW`, baseline slots, `{NAME} MUST CLEAR · {n}`, `{NAME} ADV · {label}` | Pitch diagram | 🟡 | SUGGEST: ⓘ on ADV / MUST CLEAR (glossary); rest skip |
| LM-29 | MobileScore lines: "Enter lag to begin / Match complete / {name} to throw · {cap} batons" | Status | 🟡 | SUGGEST: skip |
| LM-30 | GameWonOverlay: "You lead {a}–{b} — one more…", chips, `START GAME {n+1}` | Between-game interstitial | ⚪ | SUGGEST: skip |
| LM-31 | Match options: `Forfeit (concede)` / `Abandon match` / `Delete match` (each with desc) | Lifecycle actions — descs are decent | 🟡 | SUGGEST: skip (descriptions already explain) |
| LM-32 | MatchInvite: `Invite {name} to play` / `Share to watch` (+ footers) | Invite/spectate links | 🟡 | SUGGEST: skip (footers explain) |
| LM-33 | Post-game `StatsBlock` per side | See CM-stats | 🔴 | SUGGEST: handled by CM-1…CM-9 |

---

## WA · Watch (`/watch/[token]`, public)

| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| WA-1 | `SPECTATING · LIVE`, scoreboard, `RACE TO {n} · {name} to throw` | Read-only header | 🟡 | SUGGEST: skip (add race-to ⓘ via glossary) |
| WA-2 | Inherits full pitch + turn-log jargon to an **unauthenticated** audience with least context | MUST CLEAR / ADV / Base Kubb Double / King Shot… | 🔴 | SUGGEST: reuse the same glossary info-dots here (ensure `<InfoDot>` renders for signed-out viewers) |
| WA-3 | No game-by-game breakdown for spectators (unlike participant banner) | Asymmetry | ⚪ | SUGGEST: skip (could add game chips later) |

---

## PC · Player card (`/u/[handle]`)

| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| PC-1 | Eyebrow `PLAYER CARD`, hero record `{w}–{l}` + `RECORD` | Identity | ⚪ | SUGGEST: skip |
| PC-2 | `WIN RATE` / `PLAYED` | Derived | ⚪ | SUGGEST: skip |
| PC-3 | `LAST 5` dots + `→ latest` cue; excludes live/lag | Direction + exclusion may confuse | 🟡 | SUGGEST: ⓘ ("5 most recent completed matches, oldest → latest") |
| PC-4 | `SINGLES STATS · BASED ON {N} MATCHES` | Count differs from PLAYED (doubles/team excluded) — unexplained | 🔴 | SUGGEST: ⓘ (singles matches only — excludes team/doubles, so N can differ from PLAYED) |
| PC-5 | `TEAMS` list → `VIEW STATS →` | Team links | ⚪ | SUGGEST: skip |
| PC-6 | `MATCH HISTORY` + `View all · {n}` (cap 10) | History | ⚪ | SUGGEST: skip |

---

## TM · Team (`/teams/[id]`)

| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| TM-1 | Hero number `{n}` labeled `MATCHES` | Ambiguous: played? won? stats sample? (it's the sample count) | 🔴 | SUGGEST: inline relabel + ⓘ — it's the # of finished matches feeding these stats |
| TM-2 | Member pills (link to `/u/{handle}` when they have one) | Roster | ⚪ | SUGGEST: skip |
| TM-3 | `TEAM STATS` block; **no win/loss record** (asymmetry vs player card) | Missing record | 🟡 | SUGGEST: add a team W/L record for parity with the player card (small feature) — needs your OK → RESOLVED: **add team W/L record** (parity with player card) |

---

## CM · Cross-cutting components

### CM — StatsBlock (appears on PC, TM, LM post-game)
| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| CM-1 | `8 METER` section header | Throws from the 8m line | 🟡 | SUGGEST: ⓘ (glossary: 8-meter line) |
| CM-2 | `BASELINE ACCURACY` `{%}` · "{n} batons at baseline" | Baseline hit-rate | 🔴 | SUGGEST: ⓘ (baseline kubbs hit ÷ batons thrown at baseline) |
| CM-3 | `FIELD EFFICIENCY · KUBBS / BATON` | Ratio meaning only in tiny eyebrow | 🔴 | SUGGEST: ⓘ (kubbs knocked down per baton thrown at the field) |
| CM-4 | Phase tiles `EARLY (≤4) / MID (5–7) / LATE (8+)` | The number = field kubbs in play; "phase" unlabeled | 🔴 | SUGGEST: ⓘ (phase = # field kubbs standing: early ≤4 / mid 5–7 / late 8+) |
| CM-5 | Targets `≥1 / ≥1.5 / ≥2` (8m) and `≥3` (adv); green = met | Why targets escalate; green unexplained | 🔴 | SUGGEST: ⓘ (target = a good benchmark for that phase; green = you met it) |
| CM-6 | `ADVANTAGE LINE` section (accuracy + single field-efficiency) | Adv-line stats | 🔴 | SUGGEST: ⓘ (glossary: advantage line) |
| CM-7 | `BASELINE DOUBLES` total + `{n} · 8m │ {n} · adv` | "Double" undefined; `adv` abbrev | 🔴 | SUGGEST: ⓘ (glossary: base kubb double); spell out `adv` → "advantage" |
| CM-8 | `—` for empty samples (no legend) | No-data marker | 🟡 | SUGGEST: skip (optional tiny "no data yet" tooltip on the —) |
| CM-9 | Denominator qualifier differs: "at baseline" (8m) vs bare "{n} batons" (adv) | Minor inconsistency | ⚪ | SUGGEST: inline — make the advantage tile also say "at baseline" for consistency |

### CM — Challenge (button sheet + inbox)
| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| CM-10 | Sheet `RACE TO` selector `1/2/3` + helper "First to {n} game(s) wins" | Helper text is good | ⚪ | SUGGEST: skip |
| CM-11 | Selector offers 1/2/3 but error says "between 1 and 9" | UI/validation mismatch | 🟡 | SUGGEST: inline fix — standardize the race-to set everywhere (this sheet + MA-5) and align validation copy; needs your call on the set → RESOLVED: **1 / 2 / 3 everywhere**; align validation copy to match |
| CM-12 | Inbox `RACE TO {n}` with **no** "first to N" helper (unlike sheet) | Inconsistent | 🟡 | SUGGEST: inline — add "first to N games" under RACE TO in the inbox |
| CM-13 | Incoming vs outgoing only cued by wording ("challenged you" / "Waiting on") | No explicit label | ⚪ | SUGGEST: skip |

### CM — Match rows
| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| CM-14 | Badge `LAG` (gold) | = pre-game lag status; opaque | 🔴 | SUGGEST: ⓘ (glossary: lag) |
| CM-15 | Badges `WON / LOST / LIVE` | Clear enough | ⚪ | SUGGEST: skip |
| CM-16 | Score `{mine}–{theirs}` = games won (not points); spectator "mine" defaults to A | Games vs points | 🟡 | SUGGEST: skip (optional ⓘ "games won") |

---

## GL · Glossary candidates (shared terms → one source of truth)

These recur across surfaces; defining each once (glossary + reusable info dot) likely resolves most 🔴 rows.

| Term | Appears in | Plain-language gist to write |
|------|-----------|------------------------------|
| **kubb** / **pitch** | G, AU | the game; the playing field |
| **baton** | LM, CM, watch | the throwing stick (6 per full turn) |
| **baseline kubb** | LM, CM | the 5 kubbs on your opponent's back line |
| **field kubb** | LM, CM | kubbs standing in the field that must be cleared first |
| **8-meter line** vs **advantage line** | LM, CM | where you throw from; a closer handicap line |
| **advantage line given** | LM | leaving field kubbs lets the opponent throw closer |
| **lag** | DA, LM, match rows | opening toss at the king to decide who starts |
| **king / king shot / king hit** | LM, watch | center piece; knocking it (legally) wins, early = loss |
| **base kubb double** | LM, CM | one baton knocks a field kubb + a baseline kubb |
| **penalty kubb** | LM | kubb re-thrown/advanced after an out-of-bounds toss |
| **race to** | MA, DA, CM, LM | number of games needed to win the match |
| **field efficiency / phase (early/mid/late)** | CM | kubbs felled per baton, bucketed by how many field kubbs stood |
| **managed player** / **claim** / **identity** | AU, PL, MA | a name-only player a real person later links to their account |
| **rewind / voided / append-only** | LM | fixing a mis-scored turn without deleting history |
| **forfeit / abandon** | LM | concede (opponent wins) vs stop with no result |

---

## Suggested triage (my starting take — you decide)
- **Highest value, lowest effort:** a shared glossary + info dots covering the `GL` terms — knocks out most of LM and CM at once.
- **Clear quick wins (inline text):** DA-4 (label the LAST-5 dots), MA-1 (remove dev "spike scaffolding" copy), CM-11 (align race-to options with validation), LM-12/LM-13 (show friendly lag label, not raw code).
- **Onboarding gaps:** AU-6/PR-3 (nothing tells a new signup to set handle vs display name), AU-10–13 (the claim flow's core concepts).

---

## Appendix · Avatar uploads (PR-5) — recommended approach

Scope as its own small feature. Industry-standard pattern for a Supabase + Next.js app:

**Storage**
- A public `avatars` bucket in Supabase Storage. Object path `avatars/{user_id}/{uuid}.webp` (per-user folder).
- Storage RLS: a user may write/update/delete only within their own `{user_id}/` prefix; public read.
- On replace, delete the old object (or just overwrite) so we don't accumulate orphans.
- Store the resulting public URL in `profiles.avatar_url`, with a cache-buster (`?v={ts}`) so a new upload shows immediately past the CDN.

**Client processing (before upload — this is what makes it "easy" and cheap)**
- **Square crop**: open a crop modal locked to 1:1 with pinch/drag zoom (e.g. `react-easy-crop`). Avatars render as circles, so square in = no surprises.
- **Downscale + compress**: resize to max ~512×512 and re-encode to **WebP** (JPEG fallback) via `canvas.toBlob`, targeting < ~200 KB. Keeps storage/bandwidth tiny and uploads instant.
- **Accept** `image/*`; guard raw file size (reject > ~10 MB pre-resize). HEIC (iPhone) may not decode in all browsers — if `createImageBitmap` fails, show a friendly "try a JPG/PNG" message.

**UX flow**
- Tap the avatar (or a "Change photo" button) → file picker / drag-drop → crop modal → **Save** → show optimistic preview + spinner → upload → update profile → toast.
- Keep the initials fallback for no-avatar.
- Accessibility: real `<input type="file">`, keyboard operable, `alt` text.
- Optional: keep "paste image URL" as an advanced fallback, or drop it once upload works.

**Effort:** ~1 bucket + policies migration, 1 client upload/crop component, swap the URL field on `/profile`. The cropper is the only new dependency.
