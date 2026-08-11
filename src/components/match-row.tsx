import Link from "next/link";

import { type MatchResult, type MatchStatus, type Side } from "@/lib/supabase/matches";
import { cn } from "@/lib/utils";

export type MatchRowData = {
  match_id: string;
  status: MatchStatus;
  my_side: Side | null;
  opponent: string | null;
  opponent_handle?: string | null;
  games_won: Record<Side, number>;
  result: MatchResult;
  created_at: string;
};

export const ROW_CLASS =
  "flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left ring-1 ring-foreground/5 transition-colors hover:bg-muted";

const BADGE: Record<string, string> = {
  won: "bg-[var(--dark-forest)]/12 text-[var(--dark-forest)] border-[var(--dark-forest)]/30",
  lost: "bg-foreground/5 text-muted-foreground border-foreground/10",
  live: "bg-[var(--swedish-blue)]/12 text-[var(--swedish-blue)] border-[var(--swedish-blue)]/35",
  lag: "bg-[var(--swedish-gold)]/18 text-[var(--gold-ink)] border-[var(--swedish-gold)]/55",
};

function badge(row: MatchRowData): { label: string; cls: string } {
  if (row.result === "won") return { label: "WON", cls: BADGE.won };
  if (row.result === "lost") return { label: "LOST", cls: BADGE.lost };
  if (row.status === "live") return { label: "LIVE", cls: BADGE.live };
  if (row.status === "created") return { label: "LAG", cls: BADGE.lag };
  return { label: row.status.toUpperCase(), cls: BADGE.lost };
}

/** The inner row visual, sans wrapper — shared by the link and watch-button variants. */
export function MatchRowContent({ row }: { row: MatchRowData }) {
  const other: Side = row.my_side === "A" ? "B" : "A";
  const mine = row.my_side ? row.games_won[row.my_side] : row.games_won.A;
  const theirs = row.my_side ? row.games_won[other] : row.games_won.B;
  const b = badge(row);
  const date = new Date(row.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <>
      <span className={cn("shrink-0 rounded-full border px-2 py-1 font-mono text-[9px] font-bold tracking-widest", b.cls)}>
        {b.label}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">vs {row.opponent ?? "—"}</div>
        <div className="font-mono text-[10px] text-muted-foreground">{date}</div>
      </div>
      <span className="display shrink-0 text-lg tabular-nums">
        {mine}–{theirs}
      </span>
    </>
  );
}

/** Links to the full match page — for matches the viewer participates in. */
export function MatchRow({ row }: { row: MatchRowData }) {
  return (
    <Link href={`/matches/${row.match_id}`} className={ROW_CLASS}>
      <MatchRowContent row={row} />
    </Link>
  );
}
