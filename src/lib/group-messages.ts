import type { ThreadMessage } from "@/lib/supabase/messages";

/**
 * Turns a flat message list into render rows: day dividers plus messages
 * tagged with their position in a "run".
 *
 * A run = same sender, same day, within 5 minutes of the previous message.
 *   first → show the sender name label, square the top inner corner
 *   last  → show the timestamp (and, if it's mine, the send state)
 *
 * Pure function, no React — unit-test it directly and keep the render readable.
 */
export type Row =
  | { kind: "day"; label: string }
  | { kind: "match"; label: string; id: string }
  | { kind: "msg"; m: ThreadMessage; first: boolean; last: boolean };

const FIVE_MIN = 5 * 60_000;

function sameRun(a?: ThreadMessage, b?: ThreadMessage) {
  if (!a || !b) return false;
  if (a.sender_player_id !== b.sender_player_id) return false;
  const ta = new Date(a.created_at);
  const tb = new Date(b.created_at);
  if (ta.toDateString() !== tb.toDateString()) return false;
  return Math.abs(+tb - +ta) < FIVE_MIN;
}

/** Today / Yesterday / Sep 12 — viewer's locale and timezone. */
export function dayLabel(d: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** "FROM MATCH · SEP 14" — shown once at the top of a rolled-up match block. */
export function matchLabel(d: Date): string {
  return `FROM MATCH · ${d.toLocaleDateString([], { month: "short", day: "numeric" }).toUpperCase()}`;
}

export function toRows(messages: ThreadMessage[]): Row[] {
  const out: Row[] = [];
  let day = "";
  let matchId: string | null = null;

  messages.forEach((m, i) => {
    const at = new Date(m.created_at);
    const key = at.toDateString();
    if (key !== day) {
      day = key;
      out.push({ kind: "day", label: dayLabel(at) });
    }
    // A rolled-up match block gets one "FROM MATCH" divider at its start.
    if (m.from_match_id && m.from_match_id !== matchId) {
      out.push({ kind: "match", label: matchLabel(at), id: m.from_match_id });
    }
    matchId = m.from_match_id ?? null;
    out.push({
      kind: "msg",
      m,
      first: !sameRun(messages[i - 1], m),
      last: !sameRun(m, messages[i + 1]),
    });
  });

  return out;
}
