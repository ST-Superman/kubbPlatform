// Single source of truth for the reusable <InfoDot term="…" /> tooltips.
// Add a term here once; reference it anywhere with <InfoDot term="key" />.

export type GlossaryEntry = { label: string; body: string };

export const GLOSSARY: Record<string, GlossaryEntry> = {
  handle: {
    label: "Handle",
    body: "Your unique @username on the Kubb Portal. Edit it anytime in your profile.",
  },
  "display-name": {
    label: "Display name",
    body: "The name shown on your match cards and profile. Unlike your handle, it doesn't have to be unique.",
  },
  baton: {
    label: "Baton",
    body: "The throwing stick. You throw up to 6 per turn — fewer in the opening rounds.",
  },
  "round-cap": {
    label: "Baton limit",
    body: "How many batons you may throw this round. It opens at 2, then 4, then 6 as the game develops.",
  },
  "baseline-kubb": {
    label: "Baseline kubb",
    body: "One of the 5 kubbs on your opponent's back line. You can only throw at these once every field kubb is down.",
  },
  "field-kubb": {
    label: "Field kubb",
    body: "A kubb standing in your half of the field. You must knock all of these down before throwing at the baseline kubbs.",
  },
  "eight-meter-line": {
    label: "8-meter line",
    body: "The normal throwing line. You throw from here unless you've been granted an advantage line.",
  },
  "advantage-line": {
    label: "Advantage line",
    body: "A closer throwing line granted as a handicap when your opponent leaves field kubbs standing.",
  },
  "advantage-line-given": {
    label: "Advantage line given",
    body: "Because you left field kubbs standing, your opponent throws from a closer line next turn. Pick how close it sits to the king.",
  },
  lag: {
    label: "Lag",
    body: "The opening toss at the king. Whoever lands closest throws first — lower is better.",
  },
  king: {
    label: "King",
    body: "The tall center piece. Knock it down after clearing all your opponent's kubbs to win the game — knock it early and you lose.",
  },
  "king-shot": {
    label: "King shot",
    body: "A throw aimed at the king. Only legal once every field and baseline kubb is down.",
  },
  "king-early": {
    label: "Early king (foul)",
    body: "Hitting the king before clearing all kubbs is a foul — the game goes to your opponent.",
  },
  "base-kubb-double": {
    label: "Base kubb double",
    body: "When a single baton knocks down the last field kubb AND a baseline kubb in the same throw.",
  },
  "penalty-kubb": {
    label: "Penalty kubb",
    body: "A kubb your opponent gets to re-throw or advance after one of their batons lands out of bounds.",
  },
  "race-to": {
    label: "Race to",
    body: "How many games you need to win the match. 'Race to 2' = first to 2 games.",
  },
  "baseline-accuracy": {
    label: "Baseline accuracy",
    body: "The share of your baseline throws that connect — baseline kubbs hit ÷ batons thrown at the baseline.",
  },
  "field-efficiency": {
    label: "Field efficiency",
    body: "Field kubbs knocked down per baton thrown at the field. It's grouped by game phase — early (≤4 field kubbs standing), mid (5–7), late (8+) — because more kubbs standing means you can fell more per baton. The target rises each phase; green means you met it.",
  },
  rewind: {
    label: "Rewind",
    body: "Undo a mis-scored turn. It voids that turn (and any after it) without deleting the history.",
  },
  "managed-player": {
    label: "Managed player",
    body: "A player you add by name only — no account needed. You record results for them until they claim the profile.",
  },
  claim: {
    label: "Claim",
    body: "Linking a name-only 'managed' player to a real account, so their recorded results become that person's.",
  },
};
