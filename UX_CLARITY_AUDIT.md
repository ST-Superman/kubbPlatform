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
| G-1 | Brand lockup `KUBB PLATFORM` | Logo → `/` | ⚪ | |
| G-2 | Signed-out nav = only `SIGN IN` / `SIGN UP` | No site map before login | 🟡 | |
| G-3 | `@{handle}` in header (signed in) | User's unique handle | 🟡 | |
| G-4 | Nav links `Dashboard / Matches / Players / Profile` | Primary nav | ⚪ | |
| G-5 | Landing headline + sub-copy ("Score matches live from the pitch…") | Marketing hero | 🟡 | |
| G-6 | "from the **pitch**" | Pitch = the playing field | 🔴 | |
| G-7 | Feature card: "they **claim** their side and score their own turns" | Introduces claim/invite model | 🔴 | |
| G-8 | "**both phones** / Phone-first" | Two-device scoring model | 🟡 | |
| G-9 | `kubb` itself never defined on landing | Assumes sport knowledge | 🟡 | |
| G-10 | Brand name inconsistency: `KUBB PLATFORM` vs `kubb.coach` (claim/watch buttons) | Naming mismatch | 🟡 | |

---

## AU · Auth & onboarding

| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| AU-1 | Login heading "Welcome back" / "Sign in to pick up your game." | Copy | ⚪ | |
| AU-2 | `EMAIL`, `PASSWORD` fields (min 6, shown only on failure) | Login/signup inputs | 🟡 | |
| AU-3 | `Forgot?` link (must type email first — only told via toast after failure) | Password reset trigger | 🔴 | |
| AU-4 | OAuth `Continue with Google/Apple` | Social sign-in | ⚪ | |
| AU-5 | Signup heading "Join the **pitch**" | Pitch jargon again | 🟡 | |
| AU-6 | Signup collects no name/handle | Identity set later on `/profile`, not signposted | 🔴 | |
| AU-7 | Email-confirmation fork (some users get "check your email", others dropped in) | Inconsistent expectation | 🟡 | |
| AU-8 | `/error` copy assumes "confirmation link expired" | Also catches OAuth failures; no "request fresh link" action | 🟡 | |
| AU-9 | Reset page "Set a new password" (no context whether from email vs intentional) | Recovery + change-pw dual use | 🟡 | |

### AU (claim flow — `/claim/[token]`, `/claim/done`)
| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| AU-10 | "CLAIM YOUR IDENTITY" / "You played kubb as {name}" | Invitee binds a pre-made player to their account | 🔴 | |
| AU-11 | "Claim this **identity** to keep your results…" | What claiming does / is it reversible / one-per-account | 🔴 | |
| AU-12 | "Claiming binds this identity to your account" | Technical phrasing, consequences unclear | 🔴 | |
| AU-13 | Error "already claimed a **managed player**" | Internal term leaking; implies one-per-account never stated | 🔴 | |
| AU-14 | "ask your **match organizer** for a fresh one" | Role term | 🟡 | |
| AU-15 | `/claim/done`: "everything you play from here **counts**" | Implies prior play didn't — mixed message vs "keep your results" | 🟡 | |

---

## PR · Profile (`/profile`)

| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| PR-1 | Identity card: avatar, display name, `@handle`, "Member since" | Summary | ⚪ | |
| PR-2 | `Handle` field + helper "3–30 chars: lowercase, numbers, underscores" | Unique @-id | 🟡 | |
| PR-3 | Handle vs Display name distinction | Not explained beyond placeholder | 🔴 | |
| PR-4 | `Display name` placeholder "How your name shows on match cards" | Shown name | ⚪ | |
| PR-5 | `Avatar URL` (paste an external image link; "uploads come later") | Unusual ask for non-technical users | 🟡 | |

---

## PL · Players (`/players`)

| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| PL-1 | Tabs `Current Players` / `New Players` | Accounts vs managed | 🟡 | |
| PL-2 | Current player row: `{wins}–{losses}`, `{n} played` / `no matches` | Unlabeled record | 🟡 | |
| PL-3 | New Players intro: "Add someone by name — no account needed… they can **claim** later" | Managed-player concept | 🔴 | |
| PL-4 | New-player form: "Add to roster", helper "they can claim this identity later" | Create managed player | 🟡 | |
| PL-5 | `UNCLAIMED` badge + "Managed by you" | Managed-player state | 🔴 | |
| PL-6 | QR + claim link + "Single use · Expires in {N} days" + `Regenerate link` | Invite mechanics | 🟡 | |

---

## DA · Dashboard (`/dashboard`)

| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| DA-1 | `SEASON RECORD` `{wins}–{losses}` | "Season" undefined (= all finished matches) | 🟡 | |
| DA-2 | `WIN RATE` `{%}` | wins ÷ played | ⚪ | |
| DA-3 | `🔥 {n}-MATCH WIN STREAK` | Consecutive wins | ⚪ | |
| DA-4 | LAST-5 W/L dots — **no heading** | Five most recent decided results | 🔴 | |
| DA-5 | Resume eyebrow `LAG PHASE / YOUR LAG / WAITING ON LAG` | **Lag** = opening toss, never explained | 🔴 | |
| DA-6 | Resume eyebrow `YOU'RE UP / {OPP}'S TURN / IN PROGRESS` | Whose action | 🟡 | |
| DA-7 | Resume `GAME {n}` + `{mine}–{theirs}` (games won) | Game count vs points | 🟡 | |
| DA-8 | Coach line (e.g. "New match, fresh start.") | Flavor | ⚪ | |
| DA-9 | `CHALLENGES` inbox — `RACE TO {n}`, Accept/Decline/Cancel | See CM-challenge | 🔴 | |

---

## MA · Matches list & new match (`/matches`)

| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| MA-1 | Helper "This is **spike scaffolding to exercise the match engine**." | Dev language in UI | 🔴 | |
| MA-2 | Opponent picker "Search players or type a new name…" | Select or create managed | 🟡 | |
| MA-3 | "Playing {name} (**managed** — you'll score both sides)" | Managed concept | 🔴 | |
| MA-4 | "Playing {name} (they'll get a **challenge** to accept)" | Account = challenge flow | 🟡 | |
| MA-5 | `Race to` selector `1 / 2 / 3 / 5 / 7` (skips 4, 6) | First-to-N games | 🔴 | |
| MA-6 | Button flips `Create match` ↔ `Send challenge` | Behavior differs by opponent kind | 🟡 | |
| MA-7 | Lists `In progress` / `Completed` with MatchRows | Grouping | ⚪ | |

---

## LM · Live match (`/matches/[id]`) — the densest surface

### LM — header & banners
| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| LM-1 | Header eyebrow `RACE TO {n} · LAG PHASE / GAME {n} / FINAL` | Status | 🟡 | |
| LM-2 | `🏆 MATCH OVER · BY FORFEIT`, per-game chips `G{n} · {WINNER}` | Result banner | ⚪ | |
| LM-3 | `MATCH ABANDONED — no result recorded` | Abandoned state | ⚪ | |

### LM — panels (per side)
| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| LM-4 | Panel meta `SIDE A · WON LAG · ADV LINE {label}` | Side status | 🟡 | |
| LM-5 | Chips `SPECTATING / LAG LOCKED / ENTER LAG / YOUR TURN / WAITING / 🏆 WINNER / DEFEATED` | State chips | 🟡 | |
| LM-6 | StatTile `MY BASELINE` | Own baseline kubbs standing | 🔴 | |
| LM-7 | StatTile `TO CLEAR` (orange when >0) | Own field kubbs to clear — **perspective flips vs pitch's "MUST CLEAR"** | 🔴 | |
| LM-8 | StatTile `KING SHOTS` | Count | 🟡 | |
| LM-9 | StatTile `GAMES` | Games won | ⚪ | |

### LM — lag entry
| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| LM-10 | `LAG — TOSS AT THE KING` + select | The opening toss to decide who throws first | 🔴 | |
| LM-11 | Lag options: "Touching the King", "1–24 inches…", "Not even close", "Knocked down the King" | Lag scale | 🔴 | |
| LM-12 | Locked state shows raw code `✓ Locked (0.1)` / `(98)` / `(99)` | Opaque sentinel values | 🔴 | |
| LM-13 | Mobile lag helper "Lower is better: 0.1 touching… 99 knocked the king." | Only place the scale is explained | 🟡 | |

### LM — the turn form (core scoring input)
| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| LM-14 | Baton counter `{used} / {cap} BATONS` (red over cap) | **Round cap** varies (2/4/6) — never explained | 🔴 | |
| LM-15 | Stepper `PENALTY KUBBS` — "thrown out / re-thrown" | Penalty mechanic, terse | 🔴 | |
| LM-16 | Stepper `BATONS TO CLEAR FIELD` — "{n} field kubb(s) on your side" | Field batons | 🔴 | |
| LM-17 | Stepper `FIELD KUBBS LEFT` — "of {n} — still standing after your throws" | Easily conflated with LM-16 | 🔴 | |
| LM-18 | `ADVANTAGE LINE GIVEN — YOU LEFT FIELD KUBBS` + select (`At the King`…`12 ft`…`At the Baseline`) | Leaving field kubbs hands opponent an advantage line | 🔴 | |
| LM-19 | Toggle `BASE KUBB DOUBLE` | What a baseline double is | 🔴 | |
| LM-20 | Stepper `BATONS AT BASELINE` — "from your advantage line / from the 8 meter line" | Baseline batons + throw origin | 🔴 | |
| LM-21 | Stepper `BASELINE KUBBS HIT` — "do NOT count the double" | Assumes you know what the double is | 🔴 | |
| LM-22 | Stepper `KING SHOTS` — "attempts at the King this turn" | King attempts | 🟡 | |
| LM-23 | Toggle `KING HIT — WIN` | Knocking king (legally) wins | 🟡 | |
| LM-24 | Toggle `KING EARLY — FOUL` | Early king = instant loss | 🔴 | |
| LM-25 | Stepper controls are ± only (no numeric entry) | Interaction model | ⚪ | |

### LM — turn log, pitch, mobile, overlays, actions
| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| LM-26 | `TURN LOG · APPEND-ONLY` | Engineering term | 🟡 | |
| LM-27 | `↺ FIX MY LAST TURN` / `REWIND` / `VOIDED` / "voids the {n} turn(s) after it" | Rewind semantics | 🔴 | |
| LM-28 | `THE PITCH · SPECTATOR VIEW`, baseline slots, `{NAME} MUST CLEAR · {n}`, `{NAME} ADV · {label}` | Pitch diagram | 🟡 | |
| LM-29 | MobileScore lines: "Enter lag to begin / Match complete / {name} to throw · {cap} batons" | Status | 🟡 | |
| LM-30 | GameWonOverlay: "You lead {a}–{b} — one more…", chips, `START GAME {n+1}` | Between-game interstitial | ⚪ | |
| LM-31 | Match options: `Forfeit (concede)` / `Abandon match` / `Delete match` (each with desc) | Lifecycle actions — descs are decent | 🟡 | |
| LM-32 | MatchInvite: `Invite {name} to play` / `Share to watch` (+ footers) | Invite/spectate links | 🟡 | |
| LM-33 | Post-game `StatsBlock` per side | See CM-stats | 🔴 | |

---

## WA · Watch (`/watch/[token]`, public)

| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| WA-1 | `SPECTATING · LIVE`, scoreboard, `RACE TO {n} · {name} to throw` | Read-only header | 🟡 | |
| WA-2 | Inherits full pitch + turn-log jargon to an **unauthenticated** audience with least context | MUST CLEAR / ADV / Base Kubb Double / King Shot… | 🔴 | |
| WA-3 | No game-by-game breakdown for spectators (unlike participant banner) | Asymmetry | ⚪ | |

---

## PC · Player card (`/u/[handle]`)

| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| PC-1 | Eyebrow `PLAYER CARD`, hero record `{w}–{l}` + `RECORD` | Identity | ⚪ | |
| PC-2 | `WIN RATE` / `PLAYED` | Derived | ⚪ | |
| PC-3 | `LAST 5` dots + `→ latest` cue; excludes live/lag | Direction + exclusion may confuse | 🟡 | |
| PC-4 | `SINGLES STATS · BASED ON {N} MATCHES` | Count differs from PLAYED (doubles/team excluded) — unexplained | 🔴 | |
| PC-5 | `TEAMS` list → `VIEW STATS →` | Team links | ⚪ | |
| PC-6 | `MATCH HISTORY` + `View all · {n}` (cap 10) | History | ⚪ | |

---

## TM · Team (`/teams/[id]`)

| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| TM-1 | Hero number `{n}` labeled `MATCHES` | Ambiguous: played? won? stats sample? (it's the sample count) | 🔴 | |
| TM-2 | Member pills (link to `/u/{handle}` when they have one) | Roster | ⚪ | |
| TM-3 | `TEAM STATS` block; **no win/loss record** (asymmetry vs player card) | Missing record | 🟡 | |

---

## CM · Cross-cutting components

### CM — StatsBlock (appears on PC, TM, LM post-game)
| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| CM-1 | `8 METER` section header | Throws from the 8m line | 🟡 | |
| CM-2 | `BASELINE ACCURACY` `{%}` · "{n} batons at baseline" | Baseline hit-rate | 🔴 | |
| CM-3 | `FIELD EFFICIENCY · KUBBS / BATON` | Ratio meaning only in tiny eyebrow | 🔴 | |
| CM-4 | Phase tiles `EARLY (≤4) / MID (5–7) / LATE (8+)` | The number = field kubbs in play; "phase" unlabeled | 🔴 | |
| CM-5 | Targets `≥1 / ≥1.5 / ≥2` (8m) and `≥3` (adv); green = met | Why targets escalate; green unexplained | 🔴 | |
| CM-6 | `ADVANTAGE LINE` section (accuracy + single field-efficiency) | Adv-line stats | 🔴 | |
| CM-7 | `BASELINE DOUBLES` total + `{n} · 8m │ {n} · adv` | "Double" undefined; `adv` abbrev | 🔴 | |
| CM-8 | `—` for empty samples (no legend) | No-data marker | 🟡 | |
| CM-9 | Denominator qualifier differs: "at baseline" (8m) vs bare "{n} batons" (adv) | Minor inconsistency | ⚪ | |

### CM — Challenge (button sheet + inbox)
| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| CM-10 | Sheet `RACE TO` selector `1/2/3` + helper "First to {n} game(s) wins" | Helper text is good | ⚪ | |
| CM-11 | Selector offers 1/2/3 but error says "between 1 and 9" | UI/validation mismatch | 🟡 | |
| CM-12 | Inbox `RACE TO {n}` with **no** "first to N" helper (unlike sheet) | Inconsistent | 🟡 | |
| CM-13 | Incoming vs outgoing only cued by wording ("challenged you" / "Waiting on") | No explicit label | ⚪ | |

### CM — Match rows
| ID | Element / ask | What it is | Suggested | Decision |
|----|----------------|------------|-----------|----------|
| CM-14 | Badge `LAG` (gold) | = pre-game lag status; opaque | 🔴 | |
| CM-15 | Badges `WON / LOST / LIVE` | Clear enough | ⚪ | |
| CM-16 | Score `{mine}–{theirs}` = games won (not points); spectator "mine" defaults to A | Games vs points | 🟡 | |

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
